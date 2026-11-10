import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvex } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { useSolisAction, useSolisMutation } from "@/lib/convex";
import { formatDay, formatEur, formatInt } from "@/lib/format";
import { categoryLabel } from "./categories";
import { decodeBytes, parseBankCsv, ROLE_LABELS, type ParseResult, type ParsedTx } from "./csv";

// ViewModel of the bank CSV import: parse client-side, dry-run against Convex (duplicates + rule
// guesses), then send debits in batches to the server. Every step is undoable through the batch.
type Guess = { duplicate: boolean; vendor: string; category: string; appSlug: string | null; excluded: boolean; matched: boolean };

type Preview = {
  fileName: string;
  parsed: ParseResult;
  guesses: Guess[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; preview: Preview }
  | { kind: "importing"; preview: Preview; done: number; total: number }
  | { kind: "done"; batchId: string; fileName: string; imported: number; skipped: number; excluded: number; totalEur: number }
  | { kind: "error"; message: string };

const CHUNK = 150;
const fmtAmount = (n: number, currency: string) =>
  currency === "EUR" ? formatEur(n, { decimals: true }) : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function useImportViewModel() {
  const convex = useConvex();
  const startImport = useSolisMutation(api.expenses.startImport);
  const importChunk = useSolisAction(api.expenses.importChunk);
  const finishImport = useSolisMutation(api.expenses.finishImport);
  const undoImport = useSolisMutation(api.expenses.undoImport);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [invertSign, setInvertSign] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const lastText = useRef<{ text: string; fileName: string } | null>(null);

  const analyse = useCallback(
    async (text: string, fileName: string, invert: boolean) => {
      setPhase({ kind: "reading" });
      try {
        const parsed = parseBankCsv(text, fileName, { invertSign: invert });
        const debits = parsed.debits;
        const guesses: Guess[] = [];
        if (debits.length) {
          const dates = debits.map((d) => d.date).sort();
          for (let i = 0; i < debits.length; i += 2000) {
            const slice = debits.slice(i, i + 2000);
            const res = await convex.query(api.expenses.previewImport, {
              dateFrom: dates[0],
              dateTo: dates[dates.length - 1],
              rows: slice.map((d) => ({ externalId: d.externalId, label: d.label, vendorHint: d.vendorHint })),
            });
            guesses.push(...res);
          }
        }
        setPhase({ kind: "preview", preview: { fileName, parsed, guesses } });
      } catch (err) {
        setPhase({ kind: "error", message: (err as Error).message || "Lecture du fichier impossible." });
      }
    },
    [convex],
  );

  const onFile = useCallback(
    async (file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        setPhase({ kind: "error", message: "Fichier trop lourd (15 Mo maximum)." });
        return;
      }
      setInvertSign(false);
      const text = decodeBytes(await file.arrayBuffer());
      lastText.current = { text, fileName: file.name };
      await analyse(text, file.name, false);
    },
    [analyse],
  );

  const toggleInvert = useCallback(() => {
    if (!lastText.current) return;
    const next = !invertSign;
    setInvertSign(next);
    void analyse(lastText.current.text, lastText.current.fileName, next);
  }, [analyse, invertSign]);

  const confirm = useCallback(async () => {
    if (phase.kind !== "preview") return;
    const { preview } = phase;
    const { parsed } = preview;
    const debits = parsed.debits;
    const dates = debits.map((d) => d.date).sort();
    const ignoredCount = parsed.ignored.reduce((s, i) => s + i.count, 0);
    try {
      const batchId = await startImport({
        fileName: preview.fileName,
        format: parsed.format,
        rowsTotal: parsed.transactions.length + ignoredCount,
        rowsCredit: parsed.creditCount,
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
      });
      let imported = 0;
      let skipped = 0;
      let excluded = 0;
      for (let i = 0; i < debits.length; i += CHUNK) {
        setPhase({ kind: "importing", preview, done: i, total: debits.length });
        const rows = debits.slice(i, i + CHUNK).map((d: ParsedTx) => ({
          date: d.date,
          label: d.label,
          amount: Math.abs(d.amount),
          currency: d.currency,
          externalId: d.externalId,
          vendorHint: d.vendorHint,
        }));
        const res = await importChunk({ batchId, rows });
        imported += res.imported;
        skipped += res.skipped;
        excluded += res.excluded;
      }
      const batch = await finishImport({ batchId });
      setPhase({ kind: "done", batchId, fileName: preview.fileName, imported, skipped, excluded, totalEur: batch?.totalEur ?? 0 });
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message || "L'import a échoué." });
    }
  }, [phase, startImport, importChunk, finishImport]);

  const undo = useCallback(
    async (batchId: string) => {
      setUndoing(batchId);
      try {
        await undoImport({ batchId: batchId as Id<"importBatches"> });
        setPhase((p) => (p.kind === "done" && p.batchId === batchId ? { kind: "idle" } : p));
      } finally {
        setUndoing(null);
      }
    },
    [undoImport],
  );

  const reset = useCallback(() => {
    lastText.current = null;
    setPhase({ kind: "idle" });
  }, []);

  // Derived preview data (formatted for the view).
  let preview = null;
  if (phase.kind === "preview" || phase.kind === "importing") {
    const { parsed, guesses, fileName } = phase.preview;
    const debits = parsed.debits;
    const fresh = debits.map((d, i) => ({ d, g: guesses[i] })).filter((x) => x.g && !x.g.duplicate);
    const toImport = fresh.filter((x) => !x.g.excluded);
    const byCurrency = new Map<string, number>();
    for (const x of toImport) byCurrency.set(x.d.currency, (byCurrency.get(x.d.currency) ?? 0) + Math.abs(x.d.amount));
    const dates = parsed.transactions.map((t) => t.date).sort();
    preview = {
      fileName,
      format: parsed.formatLabel,
      details: [
        `Séparateur « ${parsed.delimiter === "\t" ? "tab" : parsed.delimiter} »`,
        parsed.decimalComma ? "virgule décimale" : "point décimal",
        `dates ${parsed.dateFormat}`,
        ...(parsed.headerless ? ["sans en-tête"] : []),
      ].join(" · "),
      columns: parsed.columns.map((c) => ({ role: ROLE_LABELS[c.role], header: c.header })),
      range: dates.length ? `${formatDay(dates[0])} → ${formatDay(dates[dates.length - 1])} ${dates[dates.length - 1].slice(0, 4)}` : "—",
      stats: [
        { label: "Lignes lues", value: formatInt(parsed.transactions.length + parsed.ignored.reduce((s, i) => s + i.count, 0)) },
        { label: "Nouvelles dépenses", value: formatInt(toImport.length) },
        { label: "Déjà connues", value: formatInt(debits.length - fresh.length) },
        { label: "Crédits ignorés", value: formatInt(parsed.creditCount) },
      ],
      totals: [...byCurrency].map(([cur, sum]) => fmtAmount(sum, cur)).join(" + ") || formatEur(0),
      foreignNote: [...byCurrency.keys()].some((c) => c !== "EUR") ? "Les montants en devise sont convertis en euros au taux du jour de l'opération." : null,
      ignored: [
        ...parsed.ignored.map((i) => `${formatInt(i.count)} ligne${i.count > 1 ? "s" : ""} ${i.reason}, ignorée${i.count > 1 ? "s" : ""}`),
        ...(fresh.length - toImport.length ? [`${formatInt(fresh.length - toImport.length)} ignorées par une règle`] : []),
      ],
      unmatched: toImport.filter((x) => !x.g.matched).length,
      warnings: parsed.warnings,
      canInvert: parsed.warnings.some((w) => w.includes("inverse")) || invertSign,
      invertSign,
      sample: toImport.slice(0, 8).map((x) => ({
        key: x.d.externalId,
        date: formatDay(x.d.date),
        label: x.d.label,
        vendor: x.g.vendor,
        category: categoryLabel(x.g.category),
        matched: x.g.matched,
        amount: fmtAmount(Math.abs(x.d.amount), x.d.currency),
      })),
      canImport: toImport.length > 0 && phase.kind === "preview",
      importLabel: toImport.length ? `Importer ${formatInt(toImport.length)} dépense${toImport.length > 1 ? "s" : ""}` : "Rien de nouveau à importer",
      progress: phase.kind === "importing" ? { done: phase.done, total: phase.total, pct: phase.total ? phase.done / phase.total : 0 } : null,
    };
  }

  return {
    phase: phase.kind,
    error: phase.kind === "error" ? phase.message : null,
    preview,
    result:
      phase.kind === "done"
        ? {
            batchId: phase.batchId,
            text: `${formatInt(phase.imported)} dépense${phase.imported > 1 ? "s" : ""} importée${phase.imported > 1 ? "s" : ""} (${formatEur(phase.totalEur, { decimals: true })})`,
            detail: [phase.skipped ? `${formatInt(phase.skipped)} doublon${phase.skipped > 1 ? "s" : ""} ignoré${phase.skipped > 1 ? "s" : ""}` : null, phase.excluded ? `${formatInt(phase.excluded)} ignorée${phase.excluded > 1 ? "s" : ""} par une règle` : null]
              .filter(Boolean)
              .join(" · "),
            fileName: phase.fileName,
          }
        : null,
    undoing,
    onFile,
    confirm,
    undo,
    reset,
    toggleInvert,
  };
}

export type ImportVM = ReturnType<typeof useImportViewModel>;
