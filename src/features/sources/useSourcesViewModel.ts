import { api } from "@convex/_generated/api";
import type { JobId, overview as overviewQuery } from "@convex/sources";
import type { RegisteredQuery } from "convex/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolisAction, useSolisQuery } from "@/lib/convex";
import { formatAgo, formatDay, formatInt } from "@/lib/format";
import type { Status } from "@/ui";

type QueryResult<Q> = Q extends RegisteredQuery<any, any, infer R> ? Awaited<R> : never;
type Overview = QueryResult<typeof overviewQuery>;
type SourceRow = Overview["sources"][number];

const STATE: Record<SourceRow["state"], { label: string; status: Status }> = {
  ok: { label: "OK", status: "good" },
  late: { label: "En retard", status: "warning" },
  error: { label: "Erreur", status: "critical" },
  running: { label: "En cours", status: "neutral" },
  interrupted: { label: "Interrompue", status: "warning" },
  notConfigured: { label: "Pas configuré", status: "neutral" },
  never: { label: "Jamais lancé", status: "neutral" },
};

export type SourceItem = {
  key: string;
  name: string;
  feeds: string;
  cadence: string;
  badge: { label: string; status: Status };
  lastOk: string;
  lastOkTitle: string | undefined;
  rows: string | null;
  /** What is wrong right now (error message, missing env vars), null when healthy. */
  problem: string | null;
  /** Missing keys are a to-do, not a failure. */
  problemTone: "critical" | "neutral";
  canRun: boolean;
  /** Muted detail: a recent error the source recovered from, else the last success message. */
  history: string | null;
  job: JobId | null;
  actionLabel: string;
  busy: boolean;
};

const ACTION_FEEDBACK_MS = 6000;

export function useSourcesViewModel() {
  const data = useSolisQuery(api.sources.overview, {}) as Overview | undefined;
  const syncNow = useSolisAction(api.sources.syncNow);
  const syncAllAction = useSolisAction(api.sources.syncAll);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // "il y a 3 min" must keep moving while the page stays open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, []);

  const markPending = useCallback((jobs: string[]) => {
    const until = Date.now() + ACTION_FEEDBACK_MS;
    setPending((p) => ({ ...p, ...Object.fromEntries(jobs.map((j) => [j, until])) }));
    window.setTimeout(() => setNow(Date.now()), ACTION_FEEDBACK_MS + 50);
  }, []);

  const run = useCallback(
    async (job: JobId) => {
      setError(null);
      setNotice(null);
      markPending([job]);
      try {
        await syncNow({ job });
        setNotice(job === "brief" ? "Brief en cours d'envoi sur Telegram." : "Synchro lancée. Le statut se met à jour tout seul.");
      } catch (e) {
        setError(`Impossible de lancer la synchro : ${(e as Error).message}`);
      }
    },
    [markPending, syncNow],
  );

  const runAll = useCallback(async () => {
    setError(null);
    setNotice(null);
    markPending(["all"]);
    try {
      const res = await syncAllAction({});
      markPending(res.scheduled);
      setNotice(`${res.scheduled.length} synchros lancées. Les statuts se mettent à jour tout seuls.`);
    } catch (e) {
      setError(`Impossible de tout synchroniser : ${(e as Error).message}`);
    }
  }, [markPending, syncAllAction]);

  const view = useMemo(() => {
    if (!data) return null;
    const runningJobs = new Set(data.sources.filter((s) => s.state === "running" && s.job).map((s) => s.job as string));
    const isBusy = (job: string | null) => !!job && (runningJobs.has(job) || (pending[job] ?? 0) > now);

    const items: SourceItem[] = data.sources.map((s) => {
      const rows = s.lastOkRows != null && s.job !== "brief" ? `${formatInt(s.lastOkRows)} ligne${s.lastOkRows > 1 ? "s" : ""}` : null;
      let problem: string | null = null;
      if (s.state === "notConfigured") {
        problem = s.missingEnv.length ? `Il manque ${s.missingEnv.join(", ")}` : (s.skippedMessage ?? "Clé manquante");
        if (s.lastOkAt) problem += `. Données en base : ${s.lastOkMessage ?? "dernier import"} (${formatAgo(s.lastOkAt)}).`;
      }
      else if (s.errorIsCurrent) problem = s.lastErrorMessage ?? "Erreur sans message";
      else if (s.state === "interrupted") problem = "La dernière synchro s'est arrêtée sans finir (délai dépassé ou redéploiement).";
      else if (s.state === "late") problem = `Dernier succès ${formatAgo(s.lastOkAt)}, attendu ${s.cadence}.`;
      const history = problem
        ? null
        : s.lastErrorAt && s.lastErrorMessage && s.lastErrorAt > (s.lastOkAt ?? 0) - 86400000
          ? `Dernière erreur ${formatAgo(s.lastErrorAt)} : ${s.lastErrorMessage}`
          : (s.lastOkMessage ?? null);
      return {
        key: s.source,
        name: s.name,
        feeds: s.feeds,
        cadence: s.cadence,
        badge: STATE[s.state],
        lastOk: s.lastOkAt ? formatAgo(s.lastOkAt) : "jamais",
        lastOkTitle: s.lastOkAt ? new Date(s.lastOkAt).toLocaleString("fr-FR") : undefined,
        rows,
        problem,
        problemTone: s.state === "notConfigured" ? "neutral" : "critical",
        canRun: !(s.state === "notConfigured" && s.missingEnv.length > 0),
        history,
        job: s.job,
        actionLabel: s.job === "brief" ? "Envoyer" : "Synchroniser",
        busy: isBusy(s.job),
      };
    });

    const counted = data.sources.filter((s) => s.job !== null);
    const ok = counted.filter((s) => s.state === "ok" || (s.state === "running" && s.health === "ok")).length;
    const failing = counted.filter((s) => s.health === "error" || s.health === "interrupted" || s.health === "late").length;
    const notConfigured = counted.filter((s) => s.state === "notConfigured").length;
    const lastRun = Math.max(0, ...data.sources.map((s) => s.lastRunAt ?? 0));

    const bank = data.bank;
    const bankItem = {
      badge: bank.imports ? { label: "Importé", status: "good" as Status } : { label: "Aucun import", status: "neutral" as Status },
      lastImport: bank.lastImportAt ? formatAgo(bank.lastImportAt) : "jamais",
      detail: bank.lastImportAt
        ? `${bank.lastFileName ?? "fichier"} · ${formatInt(bank.lastRows ?? 0)} lignes${bank.lastRange ? ` du ${formatDay(bank.lastRange.from)} au ${formatDay(bank.lastRange.to)}` : ""}`
        : "Exporte le CSV de ta banque et importe-le dans Dépenses.",
      imports: bank.imports,
    };

    return {
      kpis: {
        ok: `${ok}/${counted.length}`,
        failing,
        notConfigured,
        lastRun: lastRun ? formatAgo(lastRun) : "jamais",
      },
      items,
      bank: bankItem,
      allBusy: (pending.all ?? 0) > now,
    };
  }, [data, pending, now]);

  return { loading: data === undefined, view, run, runAll, error, notice };
}
