import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@convex/_generated/api";
import { useSolisMutation, useSolisQuery } from "@/lib/convex";
import { formatAgo, formatDay, formatDayLong, formatInt } from "@/lib/format";
import type { Status } from "@/ui";

// Carrousels page: mirror of the Carousel Factory on the Mac (convex/carousels.ts).
// URL state: ?vue=plan|review|all · &date=YYYY-MM-DD · &statut= · &compte= · &c=<carousel id> · &edit=1 (editor)

export type ViewKey = "plan" | "review" | "all";
export type ReviewAction = "ok" | "redo" | "no";

const VIEWS: ViewKey[] = ["plan", "review", "all"];
const STATUS: Record<string, { label: string; tone: Status }> = {
  planned: { label: "Planifié", tone: "neutral" },
  generated: { label: "Généré", tone: "neutral" },
  failed: { label: "Échec", tone: "critical" },
  rendered: { label: "À valider", tone: "warning" },
  in_review: { label: "Sur Telegram", tone: "warning" },
  qa_failed: { label: "QA échouée", tone: "critical" },
  approved: { label: "Validé", tone: "good" },
  redo: { label: "À refaire", tone: "warning" },
  rejected: { label: "Rejeté", tone: "critical" },
  published: { label: "Publié", tone: "good" },
};
const STATUS_FILTERS: { value: string; label: string; statuses: string[] | null }[] = [
  { value: "", label: "Tous", statuses: null },
  { value: "approved", label: "Validés", statuses: ["approved"] },
  { value: "redo", label: "À refaire", statuses: ["redo"] },
  { value: "rejected", label: "Rejetés", statuses: ["rejected"] },
  { value: "published", label: "Publiés", statuses: ["published"] },
  { value: "qa_failed", label: "QA échouée", statuses: ["qa_failed"] },
];
const QA: Record<string, { label: string; tone: Status }> = {
  pass: { label: "OK", tone: "good" },
  warn: { label: "Avertissements", tone: "warning" },
  fail: { label: "Échec", tone: "critical" },
};
const SCORE_LABELS: Record<string, string> = {
  hook: "Hook",
  save_worthiness: "Envie d'enregistrer",
  native_voice: "Ton naturel",
  accuracy: "Exactitude",
  plug: "Intégration de l'app",
  visual_fit: "Accord texte / photo",
};
export const SHORTCUTS: Record<string, ReviewAction> = { v: "ok", r: "redo", x: "no" };

export function statusOf(status: string) {
  return STATUS[status] ?? { label: status, tone: "neutral" as Status };
}

/* ---------- dates ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Minutes to add to UTC to get the wall time in `timeZone` at that instant. */
function tzOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.round((Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - utcMs) / 60000);
}

/** "19:00" in New York on `date` → "01:00" in Paris, flagged when it falls on the next day. */
export function nyToParis(date: string, slot: string): { time: string; nextDay: boolean } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot);
  if (!m) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, mo - 1, d, Number(m[1]), Number(m[2]));
  const utc = wall - tzOffsetMinutes(wall, "America/New_York") * 60000;
  const paris = new Date(utc + tzOffsetMinutes(utc, "Europe/Paris") * 60000);
  return { time: `${pad(paris.getUTCHours())}:${pad(paris.getUTCMinutes())}`, nextDay: paris.toISOString().slice(0, 10) > date };
}

/* ---------- view model ---------- */

export function useCarouselsViewModel() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get("vue") as ViewKey | null;
  const view: ViewKey = rawView && VIEWS.includes(rawView) ? rawView : "plan";
  const cid = params.get("c");
  const editing = !!cid && params.get("edit") === "1";
  const today = todayIso();
  const rawDate = params.get("date") ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const statusFilter = STATUS_FILTERS.some((f) => f.value === params.get("statut")) ? (params.get("statut") ?? "") : "";
  const account = params.get("compte") ?? "";

  const set = useCallback(
    (patch: Record<string, string | null>) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, val] of Object.entries(patch)) {
          if (val) next.set(k, val);
          else next.delete(k);
        }
        return next;
      }),
    [setParams],
  );
  const linkTo = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, val] of Object.entries(patch)) {
        if (val) next.set(k, val);
        else next.delete(k);
      }
      return `?${next.toString()}`;
    },
    [params],
  );

  const dayData = useSolisQuery(api.carousels.day, !cid && view === "plan" ? { date } : "skip");
  const listData = useSolisQuery(
    api.carousels.list,
    !cid && view !== "plan"
      ? { ...(view === "review" ? { status: "review" } : statusFilter ? { status: statusFilter } : {}), ...(account ? { account } : {}) }
      : "skip",
  );
  const detailData = useSolisQuery(api.carousels.detail, cid ? { cid } : "skip");
  const decideMutation = useSolisMutation(api.carousels.decide);

  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advance, setAdvance] = useState(true);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);
  useEffect(() => setError(null), [cid]);

  /* ---- plan ---- */
  const plan = useMemo(() => {
    if (!dayData) return null;
    const accounts = dayData.accounts.map((a) => {
      const idx = a.startDate ? daysBetween(a.startDate, date) : null;
      const state =
        idx === null
          ? { label: "Pas de date de départ", tone: "neutral" as Status, off: true }
          : idx < 0
            ? { label: `Démarre le ${formatDay(a.startDate)}`, tone: "neutral" as Status, off: true }
            : idx < a.warmupDays
              ? { label: `Chauffe · jour ${idx + 1}/${a.warmupDays}`, tone: "warning" as Status, off: false }
              : { label: `Actif · ${a.perDay} par jour`, tone: "good" as Status, off: false };
      const slots = dayData.items
        .filter((i) => i.account === a.name)
        .map((i) => {
          const paris = nyToParis(date, i.slot);
          return {
            key: i.itemId,
            ny: i.slot || "—",
            paris: paris ? `${paris.time} Paris${paris.nextDay ? " (+1)" : ""}` : "",
            hook: i.hook,
            tags: [
              { label: `${i.family} · ${i.familyName}`, kind: "family" },
              { label: i.templateName, kind: "template" },
              ...(i.mentionApp ? [{ label: `App · ${i.integrationName}`, kind: "app" }] : []),
              ...(i.series ? [{ label: i.series, kind: "series" }] : []),
            ],
            status: statusOf(i.status),
            error: i.error,
            cover: i.cover,
            href: i.carouselId ? linkTo({ c: i.carouselId }) : null,
          };
        });
      return { name: a.name, persona: a.persona, series: a.series, state, slots };
    });
    const items = dayData.items;
    return {
      title: formatDayLong(date),
      isToday: date === today,
      prev: addDays(date, -1),
      next: addDays(date, 1),
      accounts,
      empty: dayData.accounts.length === 0,
      unplanned: items.length === 0 && accounts.some((a) => !a.state.off),
      kpis: [
        { label: "Carrousels prévus", value: formatInt(items.length) },
        { label: "Avec l'app", value: formatInt(items.filter((i) => i.mentionApp).length) },
        { label: "Générés", value: formatInt(items.filter((i) => !["planned", "failed"].includes(i.status)).length) },
        { label: "Validés", value: formatInt(items.filter((i) => ["approved", "published"].includes(i.status)).length) },
      ],
      toReview: dayData.toReview,
      sync: dayData.sync,
    };
  }, [dayData, date, today, linkTo]);

  /* ---- gallery ---- */
  const gallery = useMemo(() => {
    if (!listData) return null;
    const tiles = listData.rows.map((r) => ({
      cid: r.cid,
      href: linkTo({ c: r.cid }),
      cover: r.cover,
      title: r.topic || r.cid,
      meta: `@${r.account} · ${r.templateName}`,
      slides: `${r.slideCount} slides`,
      created: formatDay(new Date(r.createdAt).toISOString()),
      status: statusOf(r.status),
    }));
    const count = (statuses: string[] | null) =>
      statuses ? statuses.reduce((n, s) => n + (listData.counts[s] ?? 0), 0) : listData.total;
    return {
      tiles,
      more: listData.shown > tiles.length ? listData.shown - tiles.length : 0,
      filters: STATUS_FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${formatInt(count(f.statuses))}` })),
      accounts: listData.accounts,
      empty: listData.total === 0,
      sync: listData.sync,
    };
  }, [listData, linkTo]);

  /* ---- detail ---- */
  const detail = useMemo(() => {
    if (detailData === undefined) return undefined;
    if (detailData === null) return null;
    const d = detailData;
    const paris = d.plan ? nyToParis(d.plan.date, d.plan.slot) : null;
    return {
      cid: d.cid,
      title: d.topic || d.cid,
      meta: `@${d.account} · ${d.templateName} · ${d.slides.length} slides · ${formatDay(new Date(d.createdAt).toISOString())}`,
      status: statusOf(d.status),
      pendingSync: d.decisionPending,
      slides: d.slides,
      caption: d.caption.trim(),
      qa: QA[d.qaStatus] ?? { label: d.qaStatus || "?", tone: "neutral" as Status },
      issues: d.qaIssues.map((i, n) => ({
        key: `${n}`,
        text: `${i.slide ? `slide ${i.slide} : ` : ""}${i.msg}`,
        tone: (i.level === "fail" ? "critical" : i.level === "warn" ? "warning" : "neutral") as Status,
      })),
      scores: d.scores
        ? Object.entries(d.scores).map(([k, val]) => ({ key: k, label: SCORE_LABELS[k] ?? k, value: val, pct: Math.max(0, Math.min(100, val * 10)) }))
        : [],
      hookOptions: d.hookOptions,
      plan: d.plan
        ? [
            { label: "Hook de départ", value: `${d.plan.hookId} · ${d.plan.hook}` },
            { label: "Famille", value: `${d.plan.family} · ${d.plan.familyName}` },
            { label: "Créneau", value: `${formatDay(d.plan.date)} · ${d.plan.slot || "—"} New York${paris ? ` (${paris.time} Paris${paris.nextDay ? ", +1" : ""})` : ""}` },
            ...(d.plan.series ? [{ label: "Série", value: d.plan.series }] : []),
            { label: "App", value: d.plan.mentionApp ? d.plan.integrationName : "Pas de mention" },
          ]
        : [],
      nextHref: d.nextToReview ? linkTo({ c: d.nextToReview }) : null,
      toReview: d.toReview,
    };
  }, [detailData, linkTo]);

  const decide = useCallback(
    async (action: ReviewAction) => {
      if (!detailData || busy) return;
      setBusy(action);
      setError(null);
      try {
        const { status } = await decideMutation({ cid: detailData.cid, action });
        setFlash(`${detailData.cid} : ${statusOf(status).label}`);
        if (advance && detailData.nextToReview) set({ c: detailData.nextToReview });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [detailData, busy, decideMutation, advance, set],
  );

  const sync = plan?.sync ?? gallery?.sync ?? null;
  const toReview = plan ? plan.toReview : listData && !account ? (listData.counts.rendered ?? 0) + (listData.counts.in_review ?? 0) : null;

  return {
    view,
    setView: (v: ViewKey) => set({ vue: v === "plan" ? null : v, c: null }),
    views: [
      { value: "plan" as ViewKey, label: "Plan" },
      { value: "review" as ViewKey, label: `À valider${toReview != null ? ` ${formatInt(toReview)}` : ""}` },
      { value: "all" as ViewKey, label: "Tous" },
    ],
    date,
    setDate: (d: string) => set({ date: d && d !== today ? d : null }),
    statusFilter,
    setStatusFilter: (s: string) => set({ statut: s || null }),
    account,
    setAccount: (a: string) => set({ compte: a || null }),
    cid,
    close: () => set({ c: null, edit: null }),
    editing,
    openEditor: () => set({ edit: "1" }),
    closeEditor: () => set({ edit: null }),
    detailData: detailData ?? null,
    plan,
    gallery,
    detail,
    loading: cid ? detailData === undefined : view === "plan" ? dayData === undefined : listData === undefined,
    review: { decide, busy, advance, setAdvance, error, flash },
    syncNote: sync ? (sync.error ? `Dernière synchro en erreur : ${sync.error}` : `synchro ${formatAgo(sync.at)}`) : null,
  };
}
