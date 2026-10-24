"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requestKey, requestValidator, type WidgetRequest } from "../cortifreeAnalytics";
import { authAction } from "../lib/auth";
import { addDays } from "../lib/dates";

// CortiFree live analytics: port of analytics-dashboard/dashboard_server.py (+ the composition done by
// dashboard.js) to Convex. Read-only calls only: Amplitude Dashboard REST API (GET) and RevenueCat v2
// (GET metrics/charts). Nothing lists metric values: events, event properties and user properties are
// discovered from the Amplitude project; a card whose events were never received says what it waits for.

/* ------------------------------------------------------------------ plumbing */

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class Slots {
  private queue: (() => void)[] = [];
  constructor(private free: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.free > 0) this.free--;
    else await new Promise<void>((resolve) => this.queue.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.free++;
    }
  }
}

type Ctx = { memo: Map<string, Promise<any>>; amp: Slots; rc: Slots; ampBlocked?: ApiError };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const compact = (day: string) => day.replaceAll("-", "");
const PSEUDO_EVENTS = new Set(["_active", "_new", "_all", "_any_revenue_event"]);

type Params = Record<string, string | number | (string | number)[] | undefined>;
function query(params: Params): string {
  const parts: string[] = [];
  for (const [k, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
  }
  return parts.join("&");
}

async function getJson(url: string, headers: Record<string, string>, label: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { ...headers, Accept: "application/json" } });
    } catch (err) {
      if (attempt < 2) {
        await sleep(1500);
        continue;
      }
      throw new ApiError(502, `${label} injoignable (${(err as Error).name})`);
    }
    // Amplitude's 429 is mostly its cost budget ("Exceeded rate limit with query of cost N"): long retries only keep
    // the action alive until it times out (600 s). Retry briefly; the page retries the card later.
    if (res.status === 429 && attempt < (label === "Amplitude" ? 2 : 5)) {
      const retry = Number(res.headers.get("Retry-After"));
      await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 3000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      let detail = "";
      try {
        const body: any = await res.json();
        const err = body?.error;
        detail = typeof err === "object" ? (err?.metadata?.details ?? err?.message ?? "") : err ? String(err) : (body?.message ?? "");
      } catch {
        /* non-JSON body */
      }
      throw new ApiError(res.status, `${label} ${res.status}${detail ? ` : ${String(detail).slice(0, 200)}` : ""}`);
    }
    return res.json();
  }
}

function env(name: string): string | undefined {
  return process.env[name] || undefined;
}

function amp(c: Ctx, path: string, params: Params = {}): Promise<any> {
  const key = env("AMPLITUDE_CORTIFREE_API_KEY");
  const secret = env("AMPLITUDE_CORTIFREE_SECRET_KEY");
  if (!key || !secret) throw new ApiError(503, "AMPLITUDE_CORTIFREE_API_KEY / AMPLITUDE_CORTIFREE_SECRET_KEY manquantes sur Convex");
  const base = (env("AMPLITUDE_API_BASE_URL") ?? "https://amplitude.com").replace(/\/$/, "");
  const qs = query(params);
  const url = `${base}${path}${qs ? `?${qs}` : ""}`;
  let hit = c.memo.get(url);
  if (!hit) {
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");
    hit = c.amp.run(async () => {
      // Once Amplitude refuses a query for its rate limit, the rest of this run fails fast instead of piling up.
      if (c.ampBlocked) throw c.ampBlocked;
      try {
        return await getJson(url, { Authorization: `Basic ${auth}` }, "Amplitude");
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) c.ampBlocked = new ApiError(429, "Amplitude : limite de requêtes atteinte (budget horaire de l'API), nouvel essai automatique dans quelques minutes");
        throw err;
      }
    });
    c.memo.set(url, hit);
    hit.catch(() => c.memo.delete(url));
  }
  return hit;
}

function rcConfigured() {
  return !!(env("REVENUECAT_CORTIFREE_SECRET_KEY") && env("REVENUECAT_CORTIFREE_PROJECT_ID"));
}

function rc(c: Ctx, path: string, params: Params = {}): Promise<any> {
  const secret = env("REVENUECAT_CORTIFREE_SECRET_KEY");
  const project = env("REVENUECAT_CORTIFREE_PROJECT_ID");
  if (!secret || !project) throw new ApiError(503, "RevenueCat non configuré");
  const qs = query(params);
  const url = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(project)}${path}${qs ? `?${qs}` : ""}`;
  let hit = c.memo.get(url);
  if (!hit) {
    hit = c.rc.run(() => getJson(url, { Authorization: `Bearer ${secret}` }, "RevenueCat")).catch((err: ApiError) => {
      const hint: Record<number, string> = { 401: " : clé secrète invalide", 403: " : la clé n'a pas la permission charts/metrics (lecture)" };
      throw new ApiError(err.status, `${err.message}${hint[err.status] ?? ""}`);
    });
    c.memo.set(url, hit);
    hit.catch(() => c.memo.delete(url));
  }
  return hit;
}

/* ------------------------------------------------------------------ ranges */

type Range = { from: string; to: string; days: number };
function rangeOf(from: string, to: string): Range {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  return { from, to, days };
}
function prevRange(r: Range): Range {
  const to = addDays(r.from, -1);
  return rangeOf(addDays(to, -(r.days - 1)), to);
}
/** Amplitude keeps one year of data and rounds a start date down to its interval (month for i=30): start no earlier
 *  than the first day of the month after the cutoff, or the whole query is refused (403). */
function retentionStart(): string {
  const cutoff = addDays(new Date().toISOString().slice(0, 10), -364);
  const d = new Date(`${cutoff.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
const ap = (r: Range) => {
  const min = retentionStart();
  const from = r.from < min ? (r.to < min ? r.to : min) : r.from;
  return { start: compact(from), end: compact(r.to) };
};

function dayLabels(xs: any[] | undefined): string[] {
  return (xs ?? []).map((x) => (typeof x === "number" ? new Date(x).toISOString().slice(0, 10) : String(x).slice(0, 10)));
}
function collapsed(entry: any): number {
  if (Array.isArray(entry) && entry.length && typeof entry[0] === "object" && entry[0]) return Number(entry[0].value ?? 0) || 0;
  if (Array.isArray(entry) && entry.length) return Number(entry[0] ?? 0) || 0;
  return 0;
}
const point = (p: any) => (p && typeof p === "object" ? Number(p.value ?? 0) : Number(p ?? 0)) || 0;
const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const lastPart = (label: any) => String(Array.isArray(label) ? label[label.length - 1] : label);

/* ------------------------------------------------------------------ discovery */

type CatalogEvent = { name: string; display: string; weekTotal: number; weekDelta: number | null; hidden: boolean };

async function catalog(c: Ctx): Promise<CatalogEvent[]> {
  const data: any[] = (await amp(c, "/api/2/events/list")).data ?? [];
  return data
    .filter((e) => !e.deleted && e.value)
    .map((e) => ({ name: String(e.value), display: String(e.display ?? e.value), weekTotal: Number(e.totals ?? 0), weekDelta: e.totals_delta ?? null, hidden: !!e.hidden }))
    .sort((a, b) => b.weekTotal - a.weekTotal);
}

async function known(c: Ctx): Promise<Set<string>> {
  return new Set((await catalog(c)).map((e) => e.name));
}

async function userProperties(c: Ctx): Promise<string[]> {
  try {
    const data: any[] = (await amp(c, "/api/2/taxonomy/user-property")).data ?? [];
    return data.filter((p) => !p.deleted && p.user_property).map((p) => String(p.user_property));
  } catch {
    return [];
  }
}

async function eventProperties(c: Ctx, event: string): Promise<string[]> {
  try {
    const data: any[] = (await amp(c, "/api/2/taxonomy/event-property", { event_type: event })).data ?? [];
    return [...new Set(data.map((p) => p.event_property).filter(Boolean).map(String))].sort();
  } catch {
    return [];
  }
}

async function resolveUserProperty(c: Ctx, name: string): Promise<string | null> {
  const props = new Set(await userProperties(c));
  for (const candidate of [name, `gp:${name}`]) if (props.has(candidate)) return candidate;
  return null;
}

const isAvailable = (event: string, set: Set<string>) => PSEUDO_EVENTS.has(event) || set.has(event);

/* ------------------------------------------------------------------ Amplitude primitives */

type Filter = { subprop_type: string; subprop_key: string; subprop_op: string; subprop_value: string[] };
type Spec = { event_type: string; filters?: Filter[] };
type Labeled = { spec: Spec; label: string };

const json = (x: unknown) => JSON.stringify(x);

/** Amplitude rounds `start` down to the interval (Monday for i=7, the 1st of the month for i=30), so any interval
 *  but daily silently widens the window (e.g. 23 Sep - 22 Oct with i=30 counted from 1 Sep). Every query is therefore
 *  daily; period totals come from seriesCollapsed, which Amplitude de-duplicates over the exact window. */
const exactInterval = (_i: number | string) => 1;

async function segmentation(c: Ctx, spec: unknown, r: Range, m: string, i: number | string, limit?: number): Promise<any> {
  return (await amp(c, "/api/2/events/segmentation", { e: json(spec), ...ap(r), m, i: exactInterval(i), limit })).data ?? {};
}

type SeriesResult = { x: string[]; series: Record<string, number[]>; totals: Record<string, number>; missing: string[] };

/** Daily series for several events (2 per Amplitude request). Unknown events are reported in `missing`. */
async function series(c: Ctx, items: Labeled[], m: string, r: Range, i: number | string = 1): Promise<SeriesResult> {
  const set = await known(c);
  const present = items.filter((it) => isAvailable(it.spec.event_type, set));
  const out: SeriesResult = { x: [], series: {}, totals: {}, missing: items.filter((it) => !isAvailable(it.spec.event_type, set)).map((it) => it.label) };
  const pairs: Labeled[][] = [];
  for (let k = 0; k < present.length; k += 2) pairs.push(present.slice(k, k + 2));
  const results = await Promise.all(
    pairs.map((pair) => {
      const params: Params = { ...ap(r), m, i: exactInterval(i) };
      pair.forEach((it, k) => (params[k === 0 ? "e" : `e${k + 1}`] = json(it.spec)));
      return amp(c, "/api/2/events/segmentation", params).then((res) => [pair, res.data ?? {}] as const);
    }),
  );
  for (const [pair, data] of results) {
    const x = dayLabels(data.xValues);
    if (x.length) out.x = x;
    pair.forEach((it, k) => {
      out.series[it.label] = ((data.series ?? [])[k] ?? []).map(point);
      out.totals[it.label] = collapsed((data.seriesCollapsed ?? [])[k]);
    });
  }
  if (!out.x.length && present.length === 0) out.x = [];
  return out;
}

type Breakdown = { missing: boolean; reason?: string; x: string[]; rows: { value: string; total: number; series?: number[] }[]; property?: string };

async function breakdown(
  c: Ctx,
  o: { event: string; prop: string; ptype?: "event" | "user"; m?: string; i?: number; limit?: number; filters?: Filter[]; withSeries?: boolean },
  r: Range,
): Promise<Breakdown> {
  const limit = Math.max(1, Math.min(o.limit ?? 25, 100));
  if (!isAvailable(o.event, await known(c))) return { missing: true, reason: `Aucun événement « ${o.event} » reçu pour l'instant`, rows: [], x: [] };
  let group: { type: string; value: string };
  if (o.ptype === "user") {
    const resolved = await resolveUserProperty(c, o.prop);
    if (!resolved) return { missing: true, reason: `Propriété utilisateur « ${o.prop} » pas encore reçue`, rows: [], x: [] };
    group = { type: "user", value: resolved };
  } else group = { type: "event", value: o.prop };
  const spec: any = { event_type: o.event, group_by: [group] };
  if (o.filters?.length) spec.filters = o.filters;
  let data: any;
  try {
    data = await segmentation(c, spec, r, o.m ?? "totals", o.i ?? 30, limit);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400 && /propert/i.test(err.message)) return { missing: true, reason: `Propriété « ${o.prop} » inconnue pour cet événement`, rows: [], x: [] };
    throw err;
  }
  const labels: any[] = data.seriesLabels ?? [];
  const rows = labels.map((label, k) => ({
    value: lastPart(label),
    total: collapsed((data.seriesCollapsed ?? [])[k]),
    ...(o.withSeries ? { series: ((data.series ?? [])[k] ?? []).map(point) } : {}),
  }));
  rows.sort((a, b) => b.total - a.total);
  return { missing: false, x: dayLabels(data.xValues), rows: rows.slice(0, limit), property: group.value };
}

async function sums(c: Ctx, o: { event: string; prop: string; filters?: Filter[]; i?: number }, r: Range): Promise<{ missing: boolean; x: string[]; series: number[]; total: number }> {
  if (!isAvailable(o.event, await known(c))) return { missing: true, x: [], series: [], total: 0 };
  const spec: any = { event_type: o.event, group_by: [{ type: "event", value: o.prop }] };
  if (o.filters?.length) spec.filters = o.filters;
  try {
    const data = await segmentation(c, spec, r, "sums", o.i ?? 1);
    return { missing: false, x: dayLabels(data.xValues), series: ((data.series ?? [[]])[0] ?? []).map(point), total: collapsed((data.seriesCollapsed ?? [[0]])[0]) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return { missing: true, x: [], series: [], total: 0 };
    throw err;
  }
}

async function users(c: Ctx, m: "active" | "new", r: Range): Promise<{ x: string[]; series: number[] }> {
  const data = (await amp(c, "/api/2/users", { m, ...ap(r), i: 1 })).data ?? {};
  return { x: dayLabels(data.xValues), series: ((data.series ?? [[]])[0] ?? []).map(point) };
}

type FunnelStepDef = { label: string; events?: string[]; spec?: Spec };

async function amplitudeFunnelRaw(c: Ctx, specs: Labeled[], r: Range, extra: Params = {}): Promise<any[]> {
  return (await amp(c, "/api/2/funnels", { e: specs.map((s) => json(s.spec)), ...ap(r), mode: "ordered", n: "active", ...extra })).data ?? [];
}

/** Ordered funnel (unique users). Each step: a list of candidate events (first available wins) or one spec. */
async function funnel(c: Ctx, defs: FunnelStepDef[], r: Range, n = "active") {
  const set = await known(c);
  const firstAvailable = (list: string[]) => list.find((e) => isAvailable(e, set)) ?? null;
  const chosen = defs.map((d) => ({ label: d.label, spec: d.spec ? (isAvailable(d.spec.event_type, set) ? d.spec : null) : (firstAvailable(d.events ?? []) ? { event_type: firstAvailable(d.events ?? [])! } : null), candidates: d.spec ? [d.spec.event_type] : (d.events ?? []) }));
  const ready = chosen.filter((d) => d.spec) as { label: string; spec: Spec; candidates: string[] }[];
  const waiting = chosen.filter((d) => !d.spec).map((d) => `${d.label} (${d.candidates.join(" / ")})`);
  if (ready.length < 2) return { computed: false, steps: [] as { label: string; event: string; count: number; medianMs: number | null }[], waiting };
  const data = await amplitudeFunnelRaw(c, ready.map((d) => ({ spec: d.spec, label: d.label })), r, { n });
  const first = data[0] ?? {};
  const counts: number[] = first.cumulativeRaw ?? [];
  const medians: number[] = first.medianTransTimes ?? [];
  return {
    computed: true,
    steps: ready.map((d, k) => ({ label: d.label, event: d.spec.event_type, count: Number(counts[k] ?? 0), medianMs: medians[k] ?? null })),
    waiting,
  };
}

/** One profile dimension (user property): users per value through ordered steps (funnel grouped by the property). */
async function icp(c: Ctx, prop: string, steps: Labeled[], r: Range) {
  const resolved = await resolveUserProperty(c, prop);
  if (!resolved) return { missing: true, prop, steps: [] as string[], segments: [] as { value: string; counts: number[] }[] };
  const set = await known(c);
  const specs = steps.filter((s) => isAvailable(s.spec.event_type, set));
  if (!specs.length) return { missing: true, prop, steps: [], segments: [], reason: "aucune étape avec des données" };
  const data = await amplitudeFunnelRaw(c, specs, r, { g: resolved, cs: 30 * 86400 });
  const segments: { value: string; counts: number[] }[] = [];
  for (const entry of data) {
    let value = entry.groupValue;
    if (value == null) continue;
    if (Array.isArray(value)) value = value.join(", ");
    const counts: number[] = (entry.cumulativeRaw ?? []).map(Number);
    if (counts.length && counts[0]) segments.push({ value: String(value), counts });
  }
  segments.sort((a, b) => b.counts[0] - a.counts[0]);
  return { missing: false, prop, steps: specs.map((s) => s.label), segments };
}

/* ------------------------------------------------------------------ onboarding */

const ONBOARDING_EVENT = "onboarding_screen_viewed";
const isFilter = (key: string, value: string): Filter => ({ subprop_type: "event", subprop_key: key, subprop_op: "is", subprop_value: [value] });

type Onboarding = {
  missing: boolean;
  flows: { id: string; label: string; users: number }[];
  flow: string | null;
  flowLabel: string | null;
  filters: Filter[];
  steps: { screen: string; users: number; order: number; stepNumbers: number[] }[];
};

/** Onboarding funnel discovered from onboarding_screen_viewed (screen_name ordered by step_number), one flow per
 *  onboarding_version (latest = default), older events (no version) grouped by total_steps as « ancien flow ». */
async function onboarding(c: Ctx, flowId: string | null | undefined, r: Range): Promise<Onboarding> {
  if (!(await known(c)).has(ONBOARDING_EVENT)) return { missing: true, flows: [], flow: null, flowLabel: null, filters: [], steps: [] };
  const grouped = async (prop: string, filters?: Filter[]) => {
    const spec: any = { event_type: ONBOARDING_EVENT, group_by: [{ type: "event", value: prop }] };
    if (filters?.length) spec.filters = filters;
    const data = await segmentation(c, spec, r, "uniques", 1);
    const days = dayLabels(data.xValues);
    return (data.seriesLabels ?? []).map((label: any, k: number) => {
      const values: number[] = ((data.series ?? [])[k] ?? []).map(point);
      const active = values.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      return { value: lastPart(label).trim(), users: collapsed((data.seriesCollapsed ?? [])[k]), lastSeen: active.length ? (days[active[active.length - 1]] ?? "") : "" };
    }) as { value: string; users: number; lastSeen: string }[];
  };
  let noVersion: Filter | null = isFilter("onboarding_version", "(none)");
  const flows: { id: string; label: string; users: number; filters: Filter[] }[] = [];
  let versions: { value: string; users: number }[] = [];
  try {
    versions = (await grouped("onboarding_version")).filter((g) => g.value && g.value !== "(none)" && g.users > 0).sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : b.users - a.users));
  } catch {
    noVersion = null; // the property was never sent: only old flows exist
  }
  versions.forEach((g, k) => flows.push({ id: `v:${g.value}`, label: `Version ${g.value}${k === 0 ? " (actuelle)" : ""}`, users: g.users, filters: [isFilter("onboarding_version", g.value)] }));
  const base = noVersion ? [noVersion] : [];
  const legacy = (await grouped("total_steps", base)).filter((g) => g.value && g.value !== "(none)" && g.users > 0).sort((a, b) => (a.lastSeen === b.lastSeen ? b.users - a.users : a.lastSeen < b.lastSeen ? 1 : -1));
  for (const g of legacy) flows.push({ id: `t:${g.value}`, label: `Ancien flow ${g.value} étapes`, users: g.users, filters: [...base, isFilter("total_steps", g.value)] });
  if (!flows.length) return { missing: false, flows: [], flow: null, flowLabel: null, filters: [], steps: [] };

  const chosenId = flowId || flows[0].id;
  const chosen = flows.find((f) => f.id === chosenId) ?? null;
  const filters = chosen ? chosen.filters : [];
  const spec: any = { event_type: ONBOARDING_EVENT, group_by: [{ type: "event", value: "screen_name" }, { type: "event", value: "step_number" }] };
  if (filters.length) spec.filters = filters;
  const data = await segmentation(c, spec, r, "uniques", 30, 200);
  const screens = new Map<string, { screen: string; users: number; weight: number; stepSum: number; steps: Set<number> }>();
  (data.seriesLabels ?? []).forEach((label: any, k: number) => {
    const [nameRaw, stepRaw = ""] = lastPart(label).split(";");
    const name = nameRaw.trim();
    const stepNumber = Number.parseFloat(stepRaw.trim());
    const count = collapsed((data.seriesCollapsed ?? [])[k]);
    let entry = screens.get(name);
    if (!entry) screens.set(name, (entry = { screen: name, users: 0, weight: 0, stepSum: 0, steps: new Set() }));
    // A screen can appear at several step numbers (optional screens shift the flow): keep the largest reach.
    entry.users = Math.max(entry.users, count);
    if (Number.isFinite(stepNumber)) {
      entry.stepSum += stepNumber * count;
      entry.weight += count;
      entry.steps.add(Math.trunc(stepNumber));
    }
  });
  const steps = [...screens.values()]
    .map((e) => ({ screen: e.screen, users: e.users, order: e.weight ? Math.round((e.stepSum / e.weight) * 100) / 100 : 9999, stepNumbers: [...e.steps].sort((a, b) => a - b) }))
    .sort((a, b) => a.order - b.order || b.users - a.users);
  return { missing: false, flows: flows.map((f) => ({ id: f.id, label: f.label, users: f.users })), flow: chosen ? chosenId : "all", flowLabel: chosen ? chosen.label : "Tous les flows", filters, steps };
}

const QUIZ_EVENTS: Record<string, string> = { habitsQuiz: "onboarding_habits_quiz_question", overall: "onboarding_overall_quiz_question" };

function screenWords(screen: string): string[] {
  return (screen.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? []).map((w) => w.toLowerCase());
}

/** Events of the live catalog that belong to an onboarding screen (onboarding_<word>…). */
function relatedEvents(screen: string, names: Iterable<string>): string[] {
  const words = screenWords(screen).filter((w) => w.length >= 4);
  const snake = screenWords(screen).join("_");
  const found: string[] = [];
  for (const name of names) {
    if (!name.startsWith("onboarding_") || name === ONBOARDING_EVENT) continue;
    const rest = name.slice("onboarding_".length);
    const first = rest.split("_")[0];
    if (rest.startsWith(snake) || words.some((w) => first === w || first.startsWith(w))) found.push(name);
  }
  return found.sort();
}

const groupedValues = (data: any): [string, number][] => (data.seriesLabels ?? []).map((label: any, k: number) => [lastPart(label), collapsed((data.seriesCollapsed ?? [])[k])]);

async function onboardingStep(c: Ctx, screen: string, r: Range) {
  const set = await known(c);
  const events: { name: string; users: number; totals: number }[] = [];
  for (const name of relatedEvents(screen, set)) {
    try {
      const u = sum(groupedValues(await segmentation(c, { event_type: name }, r, "uniques", 30, 200)).map(([, v]) => v));
      const t = sum(groupedValues(await segmentation(c, { event_type: name }, r, "totals", 30, 200)).map(([, v]) => v));
      if (u || t) events.push({ name, users: u, totals: t });
    } catch {
      /* skip unreadable event */
    }
  }
  type Q = { number: number | string; text: string; viewed: number; answered: number; avgSeconds: number | null; answers: { text: string; users: number }[] };
  let quiz: Q[] | null = null;
  let answersTracked: boolean | undefined;
  const prefix = QUIZ_EVENTS[screen];
  if (prefix) {
    const viewed = `${prefix}_viewed`;
    const answered = `${prefix}_clicked`;
    const questions = new Map<string, Q>();
    const q = (num: string) => {
      const key = String(num).split(".")[0].trim();
      let entry = questions.get(key);
      if (!entry) questions.set(key, (entry = { number: /^\d+$/.test(key) ? Number(key) : key, text: "", viewed: 0, answered: 0, avgSeconds: null, answers: [] }));
      return entry;
    };
    const byQuestion = (event: string, second?: string, m = "uniques", limit = 200) =>
      segmentation(c, { event_type: event, group_by: [{ type: "event", value: "question_number" }, ...(second ? [{ type: "event", value: second }] : [])] }, r, m, 30, limit).then(groupedValues);
    if (set.has(viewed)) for (const [label, n] of await byQuestion(viewed)) if (label !== "(none)") q(label).viewed = n;
    if (set.has(answered)) {
      for (const [label, n] of await byQuestion(answered)) if (label !== "(none)") q(label).answered = n;
      try {
        for (const [label, n] of await byQuestion(answered, "answer_text_en", "uniques", 500)) {
          const [num, ...rest] = label.split(";");
          const answer = rest.join(";").trim();
          if (answer && answer !== "(none)" && num.trim() !== "(none)") q(num.trim()).answers.push({ text: answer, users: n });
        }
        for (const [label] of await byQuestion(answered, "question_text_en")) {
          const [num, ...rest] = label.split(";");
          const text = rest.join(";").trim();
          if (text && text !== "(none)" && num.trim() !== "(none)") q(num.trim()).text = text;
        }
        const timing = new Map<string, [number, number]>();
        for (const [label, n] of await byQuestion(answered, "time_to_answer_s", "totals", 1000)) {
          const [num, seconds] = label.split(";");
          const value = Number.parseFloat(seconds);
          if (!Number.isFinite(value)) continue;
          const [t, w] = timing.get(num.trim()) ?? [0, 0];
          timing.set(num.trim(), [t + value * n, w + n]);
        }
        for (const [num, [t, w]] of timing) if (w && num !== "(none)") q(num).avgSeconds = Math.round((t / w) * 10) / 10;
        answersTracked = true;
      } catch {
        answersTracked = false; // older app versions: no answer properties yet
      }
    }
    quiz = [...questions.values()].map((x) => ({ ...x, answers: x.answers.sort((a, b) => b.users - a.users) })).sort((a, b) => (typeof a.number === "number" ? a.number : 999) - (typeof b.number === "number" ? b.number : 999));
  }
  return { screen, events, quiz, answersTracked };
}

/* ------------------------------------------------------------------ metrics (dashboard.js helpers) */

type Metric = { missing: boolean; candidates: string[]; x: string[]; series: number[]; total: number; events: string[] };

async function chooseEvents(c: Ctx, candidates: string[], mode: "sum" | "first"): Promise<string[]> {
  const set = await known(c);
  const avail = candidates.filter((e) => isAvailable(e, set));
  return mode === "first" ? avail.slice(0, 1) : avail;
}

function shape(res: SeriesResult, events: string[], from = 0, to?: number): Metric {
  const x = res.x.slice(from, to);
  const values = x.map((_, i) => events.reduce((a, e) => a + ((res.series[e] ?? [])[from + i] ?? 0), 0));
  return { missing: false, candidates: events, x, series: values, total: sum(values), events };
}

async function metricSeries(c: Ctx, candidates: string[], m: string, r: Range, mode: "sum" | "first" = "sum"): Promise<Metric> {
  const events = await chooseEvents(c, candidates, mode);
  if (!events.length) return { missing: true, candidates, x: [], series: [], total: 0, events: [] };
  const res = await series(c, events.map((e) => ({ spec: { event_type: e }, label: e })), m, r);
  const shaped = shape(res, events);
  shaped.total = events.reduce((a, e) => a + (res.totals[e] ?? 0), 0); // uniques: de-duplicated over the period
  return shaped;
}

/** Current + previous period. Totals come from one call over both windows, split by day count. */
async function metricWithPrev(c: Ctx, candidates: string[], m: string, r: Range, mode: "sum" | "first" = "sum"): Promise<[Metric, Metric]> {
  const prev = prevRange(r);
  if (m !== "totals") return Promise.all([metricSeries(c, candidates, m, r, mode), metricSeries(c, candidates, m, prev, mode)]);
  const events = await chooseEvents(c, candidates, mode);
  if (!events.length) {
    const miss: Metric = { missing: true, candidates, x: [], series: [], total: 0, events: [] };
    return [miss, miss];
  }
  const res = await series(c, events.map((e) => ({ spec: { event_type: e }, label: e })), m, rangeOf(prev.from, r.to));
  const split = Math.max(0, res.x.length - r.days);
  return [shape(res, events, split), shape(res, events, 0, split)];
}

/* ------------------------------------------------------------------ RevenueCat */

async function rcOverview(c: Ctx) {
  if (!rcConfigured()) return { configured: false as const };
  const data = await rc(c, "/metrics/overview");
  return {
    configured: true as const,
    currency: String(data.currency ?? "USD"),
    metrics: (data.metrics ?? []).map((m: any) => ({ id: String(m.id), name: String(m.name), description: m.description ?? null, unit: m.unit ?? null, period: m.period ?? null, value: m.value == null ? null : Number(m.value) })),
  };
}

async function rcChart(c: Ctx, chart: string, r: Range, resolution = "day") {
  if (!rcConfigured()) return { configured: false as const, chart };
  if (!/^[a-z0-9_]+$/i.test(chart)) throw new ApiError(400, "chart invalide");
  const data = await rc(c, `/charts/${chart}`, { start_date: r.from, end_date: r.to, resolution });
  const measures = (data.measures ?? []).map((m: any) => ({ name: String(m.display_name), unit: m.unit ?? null, chartable: !!m.chartable, description: m.description ?? null }));
  const cohorts = [...new Set<number>((data.values ?? []).map((x: any) => x.cohort).filter((x: any) => x != null))].sort((a, b) => a - b);
  const index = new Map(cohorts.map((cohort, i) => [cohort, i]));
  const values: (number | null)[][] = measures.map(() => cohorts.map(() => null));
  for (const item of data.values ?? []) {
    const m = Number(item.measure ?? 0);
    if (m < values.length && index.has(item.cohort)) values[m][index.get(item.cohort)!] = item.value == null ? null : Number(item.value);
  }
  return {
    configured: true as const,
    chart,
    name: data.display_name ?? chart,
    currency: data.yaxis_currency ?? null,
    measures,
    x: cohorts.map((cohort) => new Date(cohort * 1000).toISOString().slice(0, 10)),
    series: values,
    summary: data.summary ?? null,
  };
}

/* ------------------------------------------------------------------ widgets */

type KpiItem =
  | { key: string; t: "metric"; events: string[]; m: "totals" | "uniques"; mode?: "sum" | "first"; users?: boolean }
  | { key: string; t: "ratio"; num: string[]; den: string[] }
  | { key: string; t: "dauAvg" | "wauMau" | "onboardingRate" | "mrr" | "revenue28" | "milo" | "newUsers" | "activeUsers" };

type KpiOut = { key: string; missing?: string[]; missingNote?: string; value: number | null; prev?: number | null; spark?: (number | null)[]; events?: string[]; users?: number; extra?: Record<string, unknown> };

async function kpi(c: Ctx, item: KpiItem, r: Range): Promise<KpiOut> {
  const key = item.key;
  switch (item.t) {
    case "metric": {
      const [[a, b], u] = await Promise.all([metricWithPrev(c, item.events, item.m, r, item.mode ?? "sum"), item.users ? metricSeries(c, item.events, "uniques", r, item.mode ?? "sum") : Promise.resolve(null)]);
      if (a.missing) return { key, missing: item.events, value: null };
      return { key, value: a.total, prev: b.total, spark: a.series, events: a.events, users: u?.total };
    }
    case "ratio": {
      const [[n, pn], [d, pd]] = await Promise.all([metricWithPrev(c, item.num, "totals", r), metricWithPrev(c, item.den, "totals", r)]);
      if (n.missing || d.missing) return { key, missing: [...(d.missing ? item.den : []), ...(n.missing ? item.num : [])], value: null };
      return { key, value: d.total ? n.total / d.total : null, prev: pd.total ? pn.total / pd.total : null, spark: d.series.map((v, i) => (v ? (n.series[i] ?? 0) / v : 0)) };
    }
    case "newUsers":
    case "activeUsers": {
      const [a, b] = await metricWithPrev(c, [item.t === "newUsers" ? "_new" : "_active"], "uniques", r);
      return { key, value: a.total, prev: b.total, spark: a.series };
    }
    case "dauAvg": {
      const [a, b] = await Promise.all([users(c, "active", r), users(c, "active", prevRange(r))]);
      const avg = (s: number[]) => (s.length ? sum(s) / s.length : 0);
      return { key, value: avg(a.series), prev: avg(b.series), spark: a.series };
    }
    case "wauMau": {
      const wau = rangeOf(addDays(r.to, -6), r.to);
      const mau = rangeOf(addDays(r.to, -29), r.to);
      const [w, m, d] = await Promise.all([metricSeries(c, ["_active"], "uniques", wau), metricSeries(c, ["_active"], "uniques", mau), users(c, "active", mau)]);
      const dau = d.series.length ? sum(d.series) / d.series.length : 0;
      return { key, value: w.total, spark: m.series, extra: { mau: m.total, stickiness: m.total ? dau / m.total : null, endDay: r.to } };
    }
    case "onboardingRate": {
      const [a, b] = await Promise.all([onboarding(c, null, r), onboarding(c, null, prevRange(r))]);
      if (a.missing) return { key, missing: [ONBOARDING_EVENT], value: null };
      if (!a.steps.length) return { key, missingNote: "Aucun écran d'onboarding vu sur la période", value: null };
      const rate = (o: Onboarding) => (o.steps.length > 1 && o.steps[0].users ? o.steps[o.steps.length - 1].users / o.steps[0].users : null);
      return { key, value: rate(a), prev: rate(b), extra: { first: a.steps[0].screen, last: a.steps[a.steps.length - 1].screen, flow: a.flowLabel } };
    }
    case "mrr": {
      const o = await rcOverview(c);
      if (!o.configured) return { key, missingNote: "RevenueCat non connecté", value: null };
      const mrr = o.metrics.find((m: any) => m.id === "mrr");
      let spark: number[] = [];
      try {
        const ch = await rcChart(c, "mrr", r);
        if (ch.configured) spark = (ch.series[0] ?? []).filter((x): x is number => x != null);
      } catch {
        /* chart optional */
      }
      return { key, value: mrr?.value ?? null, prev: spark.length > 1 ? spark[0] : null, spark, extra: { currency: o.currency } };
    }
    case "revenue28": {
      const o = await rcOverview(c);
      if (o.configured) {
        const rev = o.metrics.find((m: any) => m.id === "revenue");
        return { key, value: rev?.value ?? null, extra: { currency: o.currency, source: "revenuecat" } };
      }
      const [ev] = await chooseEvents(c, ["revenue_amount", "[Amplitude] Revenue"], "first");
      if (!ev) return { key, missingNote: "Ni RevenueCat ni événement de revenu Amplitude", value: null };
      const s = await sums(c, { event: ev, prop: "$revenue" }, r);
      return { key, value: s.total, spark: s.series, extra: { currency: "USD", source: ev } };
    }
    case "milo": {
      const set = await known(c);
      const evs = set.has("milo_message_sent") ? ["milo_message_sent"] : [...set].filter((n) => n.startsWith("milo_"));
      if (!evs.length) return { key, missing: ["milo_message_sent"], value: null };
      const [[a, b], u] = await Promise.all([metricWithPrev(c, evs, "totals", r), metricSeries(c, evs.slice(0, 1), "uniques", r)]);
      return { key, value: a.total, prev: b.total, spark: a.series, users: u.total, events: evs };
    }
  }
}

type LineItem = { key: string; events: (string | Spec)[]; mode?: "sum" | "first" };

/** Several daily lines in one go; each line sums its available candidate events. */
async function lines(c: Ctx, items: LineItem[], m: string, r: Range) {
  const set = await known(c);
  const plan = items.map((it) => {
    const specs = it.events.map((e) => (typeof e === "string" ? { event_type: e } : e)).filter((s) => isAvailable(s.event_type, set));
    return { it, specs: it.mode === "first" ? specs.slice(0, 1) : specs };
  });
  const labeled: Labeled[] = plan.flatMap((p) => p.specs.map((spec, k) => ({ spec, label: `${p.it.key}#${k}` })));
  const res = labeled.length ? await series(c, labeled, m, r) : { x: [], series: {}, totals: {}, missing: [] };
  return {
    x: res.x,
    lines: plan.map((p) => ({
      key: p.it.key,
      missing: p.specs.length === 0,
      candidates: p.it.events.map((e) => (typeof e === "string" ? e : e.event_type)),
      events: p.specs.map((s) => s.event_type),
      values: res.x.map((_, i) => p.specs.reduce((a, _s, k) => a + ((res.series as Record<string, number[]>)[`${p.it.key}#${k}`]?.[i] ?? 0), 0)),
      total: p.specs.reduce((a, _s, k) => a + ((res.totals as Record<string, number>)[`${p.it.key}#${k}`] ?? 0), 0),
    })),
  };
}

type BreakdownItem = { id: string; event: string; prop?: string | null; ptype?: "event" | "user"; m?: string; limit?: number; filters?: Filter[]; withSeries?: boolean };

const PREFERRED_PROPS = ["content_title", "title", "content_key", "category", "kind", "type", "name"];

async function breakdownItem(c: Ctx, it: BreakdownItem, r: Range) {
  if (!isAvailable(it.event, await known(c))) return { id: it.id, event: it.event, prop: it.prop ?? null, missing: true, reason: null, rows: [], x: [] };
  let prop = it.prop ?? null;
  if (!prop) {
    const list = await eventProperties(c, it.event);
    prop = PREFERRED_PROPS.find((p) => list.includes(p)) ?? list.find((p) => !/(^|_)(id|timestamp)$/.test(p)) ?? list[0] ?? null;
    if (!prop) return { id: it.id, event: it.event, prop: null, missing: true, reason: "Aucune propriété sur cet événement", rows: [], x: [] };
  }
  const b = await breakdown(c, { event: it.event, prop, ptype: it.ptype, m: it.m, i: it.withSeries ? 1 : 30, limit: it.limit ?? 12, filters: it.filters, withSeries: it.withSeries }, r);
  return { id: it.id, event: it.event, prop, missing: b.missing, reason: b.reason ?? null, rows: b.rows, x: b.x };
}

const STEP_PAYWALL = ["paywall_open", "onboarding_paywall_viewed"];
const STEP_TRIAL = ["trial_started", "rc_trial_started_event"];
const STEP_PURCHASE = ["transaction_complete", "subscription_started", "subscription_purchased", "rc_initial_purchase_event"];

async function icpSteps(c: Ctx): Promise<Labeled[]> {
  const cat = await catalog(c);
  const volume = (name: string) => cat.find((e) => e.name === name)?.weekTotal ?? 0;
  const set = new Set(cat.map((e) => e.name));
  const pick = (list: string[]) => list.filter((e) => set.has(e)).sort((a, b) => volume(b) - volume(a))[0] ?? null;
  return [
    { label: "Début", event: pick(["onboarding_profile_completed", "onboarding_welcome_viewed", ONBOARDING_EVENT]) },
    { label: "Paywall vu", event: pick(STEP_PAYWALL) },
    { label: "Essai", event: pick(STEP_TRIAL) },
    { label: "Achat", event: pick(STEP_PURCHASE) },
  ]
    .filter((s): s is { label: string; event: string } => !!s.event)
    .map((s) => ({ spec: { event_type: s.event }, label: s.label }));
}

const ICP_ORDER = [
  "icp_age", "icp_gender", "icp_main_reason", "icp_stress_reasons", "icp_reason_count", "icp_stress_duration", "icp_symptoms", "icp_symptom_count",
  "icp_primary_goal", "icp_available_minutes", "icp_global_score", "icp_stress_score", "icp_sleep_score", "icp_energy_score", "icp_focus_score",
  "country", "app_language", "language", "device_type", "plan_goal", "has_apple_watch",
];
const ICP_EXPECTED = ["icp_age", "icp_gender", "icp_main_reason", "icp_stress_reasons", "icp_stress_duration", "icp_symptoms"];

async function icpAll(c: Ctx, r: Range) {
  const steps = await icpSteps(c);
  const props = [...new Set((await userProperties(c)).map((p) => (p.startsWith("gp:") ? p.slice(3) : p)))];
  const rank = (p: string) => {
    const i = ICP_ORDER.indexOf(p);
    return i < 0 ? 99 : i;
  };
  const icpProps = props.filter((p) => p.startsWith("icp_")).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
  const extra = ["country", "app_language", "device_type", "plan_goal", "has_apple_watch"].filter((p) => props.includes(p));
  const dims = [...ICP_EXPECTED.filter((p) => !icpProps.includes(p)), ...icpProps, ...extra].sort((a, b) => rank(a) - rank(b));
  // Funnels are the most expensive Amplitude queries (cost-based rate limit): two at a time, and a dimension that
  // still fails is reported as such (the widget is then marked partial and recomputed after 2 min).
  const lane = new Slots(2);
  const results = await Promise.all(
    dims.map((d) =>
      lane.run(() =>
        icp(c, d, steps, r).then(
          (res) => ({ ...res, error: null as string | null }),
          (err) => ({ missing: false, prop: d, steps: [] as string[], segments: [] as { value: string; counts: number[] }[], error: String((err as Error)?.message ?? err).slice(0, 200) }),
        ),
      ),
    ),
  );
  return { steps: steps.map((s) => ({ label: s.label, event: s.spec.event_type })), notYet: ICP_EXPECTED.filter((p) => !props.includes(p)), dims: results, partial: results.some((x) => x.error) };
}

async function onboardingTime(c: Ctx, r: Range) {
  const counts = await breakdown(c, { event: "onboarding_completed", prop: "onboarding_path", m: "totals", i: 30, limit: 10 }, r).catch(() => null);
  const rows = (counts?.rows ?? []).filter((x) => x.value && x.value !== "(none)");
  const out = await Promise.all(
    rows.map(async (x) => {
      const s = await sums(c, { event: "onboarding_completed", prop: "total_time_seconds", i: 30, filters: [isFilter("onboarding_path", x.value)] }, r).catch(() => null);
      return { path: x.value, completed: x.total, totalSeconds: s && !s.missing ? s.total : null };
    }),
  );
  return { rows: out };
}

async function topEventsPeriod(c: Ctx, r: Range) {
  const names = (await catalog(c)).filter((e) => !e.hidden).slice(0, 30).map((e) => e.name);
  const res = await series(c, names.map((n) => ({ spec: { event_type: n }, label: n })), "totals", r, 30);
  return { rows: Object.entries(res.totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, total]) => ({ name, total })) };
}

async function productMix(c: Ctx, r: Range) {
  const set = await known(c);
  const sources = ([["transaction_complete", "product_id"], ["subscription_started", "product_id"], ["trial_started", "product_id"], ["subscription_purchased", "product_id"], ["revenue_amount", "$productId"], ["[Amplitude] Revenue", "$productId"]] as const).filter(([e]) => set.has(e));
  if (!sources.length) return { sources: [] as string[], rows: [] as { product: string; counts: Record<string, number> }[] };
  const results = await Promise.all(sources.map(([event, prop]) => breakdown(c, { event, prop, i: 30, limit: 15 }, r)));
  const products = new Map<string, Record<string, number>>();
  results.forEach((res, k) =>
    res.rows.forEach((row) => {
      if (!products.has(row.value)) products.set(row.value, {});
      products.get(row.value)![sources[k][0]] = row.total;
    }),
  );
  return { sources: sources.map(([e]) => e), rows: [...products.entries()].filter(([, v]) => Object.values(v).some((x) => x > 0)).map(([product, counts]) => ({ product, counts })) };
}

const PAYWALL_EVENTS = ["paywall_open", "paywall_close", "paywall_decline", "paywall_load_failed"];
const PAYWALL_DIMS = ["placement", "paywall_identifier", "paywall_name", "variant_id", "experiment_id"];

async function paywalls(c: Ctx, dim: string, r: Range) {
  if (!PAYWALL_DIMS.includes(dim)) throw new ApiError(400, "dimension invalide");
  const set = await known(c);
  const avail = PAYWALL_EVENTS.filter((e) => set.has(e));
  const results = await Promise.all(avail.map((e) => breakdown(c, { event: e, prop: dim, m: "totals", i: 30, limit: 30 }, r).then((res) => [e, res] as const)));
  const rows = new Map<string, Record<string, number>>();
  for (const [event, res] of results) {
    if (res.missing) continue;
    for (const row of res.rows) {
      if (!rows.has(row.value)) rows.set(row.value, {});
      const target = rows.get(row.value)!;
      target[event] = (target[event] ?? 0) + row.total;
    }
  }
  return { events: avail, missing: PAYWALL_EVENTS.filter((e) => !set.has(e)), rows: [...rows.entries()].map(([value, counts]) => ({ value, counts })).sort((a, b) => (b.counts.paywall_open ?? 0) - (a.counts.paywall_open ?? 0)) };
}

async function revenueAmp(c: Ctx, r: Range) {
  const set = await known(c);
  const candidates = ["revenue_amount", "[Amplitude] Revenue", ...[...set].filter((n) => n.startsWith("rc_"))].filter((e) => set.has(e));
  // $revenue stays 0 when the app logs only $price (Amplitude computes it from price x quantity only for some SDK
  // paths): sum the first revenue-like property that carries values on each event.
  const REVENUE_PROPS = ["$revenue", "revenue", "$price", "price"];
  const sets = await Promise.all(
    candidates.map(async (e) => {
      const props = await eventProperties(c, e).catch(() => [] as string[]);
      const order = ["$revenue", ...REVENUE_PROPS.filter((p) => p !== "$revenue" && props.includes(p))];
      let last: Awaited<ReturnType<typeof sums>> & { prop: string } = { missing: true, x: [], series: [], total: 0, prop: "$revenue" };
      for (const prop of order) {
        last = { ...(await sums(c, { event: e, prop }, r)), prop };
        if (!last.missing && last.total) break;
      }
      return { event: e, ...last };
    }),
  );
  let ltv: any = null;
  try {
    const out: any = {};
    for (const [metric, key] of [[2, "totalRevenue"], [0, "arpu"]] as const) {
      const data = (await amp(c, "/api/2/revenue/ltv", { ...ap(r), m: metric })).data ?? {};
      const combined = ((data.series ?? [{}])[0] ?? {}).combined ?? {};
      out[key] = Object.fromEntries(Object.entries(combined).filter(([k]) => ["count", "paid", "r1d", "r7d", "r14d", "r30d", "r60d", "r90d"].includes(k)));
    }
    ltv = out;
  } catch {
    ltv = null;
  }
  return { candidates, series: sets.filter((s) => !s.missing && s.total).map((s) => ({ event: s.event, prop: s.prop, x: s.x, values: s.series, total: s.total })), ltv };
}

const LIFECYCLE = ["trial_started", "trial_converted", "trial_expired", "subscription_started", "subscription_purchased", "transaction_complete", "non_recurring_purchase", "subscription_auto_renew_off", "subscription_auto_renew_on", "subscription_expired", "transaction_restore"];

async function lifecycle(c: Ctx, r: Range) {
  const set = await known(c);
  const evs = [...LIFECYCLE, ...[...set].filter((n) => n.startsWith("rc_"))];
  const avail = evs.filter((e) => set.has(e));
  if (!avail.length) return { rows: [], missing: evs };
  const items = avail.map((e) => ({ spec: { event_type: e }, label: e }));
  const [cur, before] = await Promise.all([series(c, items, "totals", r, 30), series(c, items, "totals", prevRange(r), 30)]);
  return { rows: avail.map((e) => ({ event: e, current: cur.totals[e] ?? 0, previous: before.totals[e] ?? 0 })), missing: evs.filter((e) => !set.has(e)) };
}

async function retention(c: Ctx, r: Range) {
  const data = (await amp(c, "/api/2/retention", { se: json({ event_type: "_new" }), re: json({ event_type: "_active" }), ...ap(r) })).data ?? {};
  const s = (data.series ?? [{}])[0] ?? {};
  const combined: any[] = s.combined ?? [];
  const days = combined.slice(1).map((cell, day) => ({ day, count: Number(cell.count ?? 0), outof: Number(cell.outof ?? 0), incomplete: !!cell.incomplete }));
  const cohorts = ((s.dates ?? []) as string[]).slice(0, 60).flatMap((date) => {
    const cells: any[] = (s.values ?? {})[date] ?? [];
    if (!cells.length) return [];
    return [{ date, size: Number(cells[0].outof ?? 0), days: cells.slice(1, 16).map((cell) => (cell.incomplete && !cell.count ? null : Number(cell.count ?? 0))) }];
  });
  const datetimes: string[] = s.datetimes ?? [];
  return { cohortSize: combined.length ? Number(combined[0].outof ?? 0) : 0, days: days.slice(0, 32), cohorts: cohorts.map((co, i) => ({ ...co, day: datetimes[i] ? String(datetimes[i]).slice(0, 10) : null })) };
}

async function sessionsPerUser(c: Ctx, r: Range) {
  if (!(await known(c)).has("session_start")) return { missing: true, x: [], values: [] };
  const items = [{ spec: { event_type: "session_start" }, label: "session_start" }];
  const [t, u] = await Promise.all([series(c, items, "totals", r), series(c, items, "uniques", r)]);
  const tt = t.series.session_start ?? [];
  const uu = u.series.session_start ?? [];
  return { missing: false, x: t.x, values: tt.map((v, i) => (uu[i] ? Math.round((v / uu[i]) * 100) / 100 : null)) };
}

/** Average 0-5 end-of-session rating per content (session_rated: content_key, content_title, rating). */
async function ratings(c: Ctx, r: Range) {
  if (!(await known(c)).has("session_rated")) return { missing: true, types: [], contents: [] };
  const grouped = async (second: string) => {
    const data = await segmentation(c, { event_type: "session_rated", group_by: [{ type: "event", value: "content_key" }, { type: "event", value: second }] }, r, "totals", 30, 1000);
    return groupedValues(data).flatMap(([label, n]) => {
      const parts = label.split(";").map((p) => p.trim());
      return parts.length >= 2 ? [[parts[0], parts.slice(1).join(";").trim(), Math.trunc(n)] as const] : [];
    });
  };
  const titles = new Map<string, [string, number]>();
  for (const [key, title, count] of await grouped("content_title")) if (title && title !== "(none)" && count >= (titles.get(key)?.[1] ?? -1)) titles.set(key, [title, count]);
  const contents = new Map<string, { count: number; sum: number; distribution: number[] }>();
  for (const [key, ratingText, count] of await grouped("rating")) {
    const rating = Math.trunc(Number.parseFloat(ratingText));
    if (!key || key === "(none)" || !(rating >= 0 && rating <= 5) || count <= 0) continue;
    let e = contents.get(key);
    if (!e) contents.set(key, (e = { count: 0, sum: 0, distribution: [0, 0, 0, 0, 0, 0] }));
    e.count += count;
    e.sum += rating * count;
    e.distribution[rating] += count;
  }
  const types = new Map<string, { count: number; sum: number }>();
  const list = [...contents.entries()].map(([key, e]) => {
    const [type, ...rest] = key.split(":");
    const t = types.get(type) ?? { count: 0, sum: 0 };
    t.count += e.count;
    t.sum += e.sum;
    types.set(type, t);
    return { key, type, id: rest.join(":"), title: titles.get(key)?.[0] ?? rest.join(":"), count: e.count, average: Math.round((e.sum / e.count) * 100) / 100, distribution: e.distribution };
  });
  list.sort((a, b) => b.count - a.count || b.average - a.average);
  return { missing: false, types: [...types.entries()].map(([type, t]) => ({ type, count: t.count, average: Math.round((t.sum / t.count) * 100) / 100 })), contents: list.slice(0, 40) };
}

const MOOD_SCORE: Record<string, number> = { awful: 1, angry: 2, low: 3, okay: 4, good: 5, amazing: 6 };

async function checkinAverages(c: Ctx, r: Range) {
  const event = "daily_checkin_completed";
  if (!(await known(c)).has(event)) return { missing: true, mood: null, stress: null, sleep: null, energy: null };
  const average = async (prop: string, score?: Record<string, number>) => {
    const b = await breakdown(c, { event, prop, i: 30, limit: 10 }, r);
    if (b.missing) return null;
    let n = 0;
    let total = 0;
    for (const x of b.rows) {
      const v = score ? score[x.value] : Number(x.value);
      if (v != null && Number.isFinite(v)) {
        n += x.total;
        total += v * x.total;
      }
    }
    return n ? total / n : null;
  };
  const [mood, stress, sleep, energy] = await Promise.all([average("mood", MOOD_SCORE), average("stress"), average("sleep"), average("energy")]);
  return { missing: false, mood, stress, sleep, energy };
}

async function notificationPermission(c: Ctx, r: Range) {
  const b = await breakdown(c, { event: "_active", prop: "notification_permission", ptype: "user", m: "uniques", i: 30, limit: 10 }, r);
  if (!b.missing && b.rows.length) return { source: "user", rows: b.rows, reason: null, alt: null };
  const [alt] = await chooseEvents(c, ["notification_permission_changed", "onboarding_notifications_permission_result"], "first");
  if (alt) {
    const props = await eventProperties(c, alt);
    const p = props.find((x) => /^(to|result|status|granted)$/.test(x)) ?? props[0];
    if (p) {
      const fb = await breakdown(c, { event: alt, prop: p, m: "uniques", i: 30, limit: 10 }, r);
      if (!fb.missing && fb.rows.length) return { source: "event", rows: fb.rows, reason: b.reason ?? null, alt: { event: alt, prop: p } };
    }
  }
  return { source: null, rows: [], reason: b.reason ?? "Pas encore de données", alt: null };
}

const N_SCHEDULED = ["notification_scheduled"];
const N_DELIVERED = ["notification_delivered", "notification_received"];
const N_OPENED = ["notification_opened", "notification_clicked"];

async function notificationsByType(c: Ctx, r: Range) {
  const set = await known(c);
  const groups = [N_SCHEDULED, N_DELIVERED, N_OPENED];
  const types = new Map<string, number[]>();
  for (let k = 0; k < groups.length; k++) {
    for (const event of groups[k].filter((e) => set.has(e))) {
      const b = await breakdown(c, { event, prop: "notification_type", m: "totals", i: 30, limit: 30 }, r);
      if (b.missing) continue;
      for (const row of b.rows) {
        if (!types.has(row.value)) types.set(row.value, [0, 0, 0]);
        types.get(row.value)![k] += row.total;
      }
    }
  }
  return { rows: [...types.entries()].filter(([, v]) => v.some((x) => x > 0)).sort((a, b) => b[1][1] + b[1][0] - a[1][1] - a[1][0]).map(([type, v]) => ({ type, scheduled: v[0], delivered: v[1], opened: v[2] })) };
}

const BUCKETS = ["0", "1-2", "3-5", "6-10", "11+"];

async function exerciseOutcomes(c: Ctx, r: Range) {
  const set = await known(c);
  const trialOff = [isFilter("period_type", "trial")];
  const outcomes = [
    { key: "converted", event: "trial_converted", filters: undefined as Filter[] | undefined },
    { key: "cancelled", event: "subscription_auto_renew_off", filters: trialOff },
    { key: "expired", event: "trial_expired", filters: undefined },
  ];
  const results = await Promise.all(
    outcomes.map(async (o) => {
      if (!set.has(o.event)) return { key: o.key, counts: {} as Record<string, number>, total: 0, sum: null as number | null };
      const [b, s] = await Promise.all([
        breakdown(c, { event: o.event, prop: "exercises_bucket", m: "uniques", i: 30, limit: 10, filters: o.filters }, r).catch(() => null),
        sums(c, { event: o.event, prop: "exercises_completed", i: 30, filters: o.filters }, r).catch(() => null),
      ]);
      const counts = Object.fromEntries((b && !b.missing ? b.rows : []).map((x) => [x.value, x.total]));
      const total = BUCKETS.reduce((t, k) => t + (counts[k] ?? 0), 0);
      return { key: o.key, counts, total, sum: s && !s.missing ? s.total : null };
    }),
  );
  return { buckets: BUCKETS, outcomes: results };
}

async function explorerEvent(c: Ctx, event: string, r: Range) {
  if (!isAvailable(event, await known(c))) return { missing: true, x: [], totals: [], uniques: [], total: 0, users: 0, prevTotal: 0 };
  const items = [{ spec: { event_type: event }, label: event }];
  const [t, u, pt] = await Promise.all([series(c, items, "totals", r), series(c, items, "uniques", r), series(c, items, "totals", prevRange(r))]);
  return { missing: false, x: t.x, totals: t.series[event] ?? [], uniques: u.series[event] ?? [], total: t.totals[event] ?? 0, users: u.totals[event] ?? 0, prevTotal: pt.totals[event] ?? 0 };
}

const HIDDEN_USER_PROPS = ["amplitude_id", "event_id", "session_id", "user_id", "device_id", "ip_address", "location_lat", "location_lng", "server_upload_time", "_time", "first_name"];

async function explorerProps(c: Ctx, event: string) {
  const [ep, up] = await Promise.all([eventProperties(c, event), userProperties(c)]);
  const names: string[] = [];
  for (const p of up) {
    const n = p.startsWith("gp:") ? p.slice(3) : p;
    if (!names.includes(n) && !HIDDEN_USER_PROPS.includes(n)) names.push(n);
  }
  return { event: ep, user: names };
}

/* ------------------------------------------------------------------ dispatcher */

async function compute(c: Ctx, req: WidgetRequest): Promise<unknown> {
  const p: any = req.p ?? {};
  const r = req.from && req.to ? rangeOf(req.from, req.to) : rangeOf(addDays(new Date().toISOString().slice(0, 10), -30), addDays(new Date().toISOString().slice(0, 10), -1));
  switch (req.w) {
    case "catalog":
      return { events: await catalog(c), amplitudeHost: new URL(env("AMPLITUDE_API_BASE_URL") ?? "https://amplitude.com").host, revenuecatConfigured: rcConfigured() };
    case "kpis":
      return { items: await Promise.all((p.items as KpiItem[]).map((it) => kpi(c, it, r))) };
    case "lines":
      return lines(c, p.items as LineItem[], p.m ?? "totals", r);
    case "users": {
      const [a, n] = await Promise.all([users(c, "active", r), users(c, "new", r)]);
      return { x: a.x, active: a.series, fresh: n.series };
    }
    case "breakdowns":
      return { items: await Promise.all((p.items as BreakdownItem[]).map((it) => breakdownItem(c, it, r))) };
    case "funnel":
      return funnel(c, p.steps as FunnelStepDef[], r, p.n ?? "active");
    case "onboarding":
      return onboarding(c, p.flow ?? null, r);
    case "onboardingStep":
      return onboardingStep(c, String(p.screen ?? ""), r);
    case "obDaily": {
      const ob = await onboarding(c, p.flow ?? null, r);
      if (ob.missing || ob.steps.length < 2) return { missing: true, x: [], first: null, last: null };
      const spec = (screen: string): Spec => ({ event_type: ONBOARDING_EVENT, filters: [isFilter("screen_name", screen), ...ob.filters] });
      const firstS = ob.steps[0].screen;
      const lastS = ob.steps[ob.steps.length - 1].screen;
      const s = await series(c, [{ spec: spec(firstS), label: "first" }, { spec: spec(lastS), label: "last" }], "uniques", r);
      return { missing: false, x: s.x, first: { screen: firstS, values: s.series.first ?? [] }, last: { screen: lastS, values: s.series.last ?? [] } };
    }
    case "obAcqPaywall": {
      const ob = await onboarding(c, p.flow ?? null, r);
      const screenStep = (screen: string, label: string): FunnelStepDef => ({ label, spec: { event_type: ONBOARDING_EVENT, filters: [isFilter("screen_name", screen), ...ob.filters] } });
      const defs: FunnelStepDef[] = [{ label: "Installation", events: ["[Amplitude] Application Installed"] }];
      if (!ob.missing && ob.steps.length > 1) defs.push(screenStep(ob.steps[0].screen, `Onboarding : ${ob.steps[0].screen}`), screenStep(ob.steps[ob.steps.length - 1].screen, `Onboarding : ${ob.steps[ob.steps.length - 1].screen}`));
      defs.push({ label: "Paywall vu", events: STEP_PAYWALL });
      return funnel(c, defs, r);
    }
    case "icpSegments":
      return icp(c, String(p.prop), (p.steps as { event_type: string; label: string }[]).map((s) => ({ spec: { event_type: s.event_type }, label: s.label })), r);
    case "icpAll":
      return icpAll(c, r);
    case "obTime":
      return onboardingTime(c, r);
    case "topEventsPeriod":
      return topEventsPeriod(c, r);
    case "productMix":
      return productMix(c, r);
    case "paywalls":
      return paywalls(c, String(p.dim ?? "placement"), r);
    case "revenueAmp":
      return revenueAmp(c, r);
    case "lifecycle":
      return lifecycle(c, r);
    case "retention":
      return retention(c, r);
    case "sessionsPerUser":
      return sessionsPerUser(c, r);
    case "ratings":
      return ratings(c, r);
    case "ciAverages":
      return checkinAverages(c, r);
    case "ntPermission":
      return notificationPermission(c, r);
    case "ntByType":
      return notificationsByType(c, r);
    case "exOutcomes":
      return exerciseOutcomes(c, r);
    case "explorerEvent":
      return explorerEvent(c, String(p.event ?? ""), r);
    case "explorerProps":
      return explorerProps(c, String(p.event ?? ""));
    case "rcOverview":
      return rcOverview(c);
    case "rcCharts":
      return { charts: await Promise.all((p.charts as string[]).map((chart) => rcChart(c, chart, r))) };
    default:
      throw new ApiError(400, `widget inconnu : ${req.w}`);
  }
}

/** Computes the requested widgets (missing or expired ones, or all with force) and writes each to the cache
 *  as soon as it is ready, so the page fills in progressively. */
export const refresh = authAction({
  args: { requests: v.array(requestValidator), force: v.optional(v.boolean()) },
  handler: async (ctx, { requests, force }): Promise<{ computed: number; failed: number; skipped: number }> => {
    const freshList: string[] = force ? [] : await ctx.runQuery(internal.cortifreeAnalytics.freshKeys, { requests });
    const fresh = new Set<string>(freshList);
    const todo: WidgetRequest[] = requests.filter((req) => !fresh.has(requestKey(req)));
    const c: Ctx = { memo: new Map(), amp: new Slots(4), rc: new Slots(2) };
    const pool = new Slots(3);
    let ok = 0;
    let failed = 0;
    await Promise.all(
      todo.map((req) =>
        pool.run(async () => {
          const key = requestKey(req);
          try {
            // Stored as JSON text: Amplitude values become object keys (event names, "$productId"…) that are not valid Convex field names.
            const payload = JSON.stringify(await compute(c, req));
            await ctx.runMutation(internal.cortifreeAnalytics.writeCache, { key, payload, fetchedAt: Date.now() });
            ok++;
          } catch (err) {
            const message = String((err as Error)?.message ?? err).slice(0, 300);
            await ctx.runMutation(internal.cortifreeAnalytics.writeCache, { key, error: message, fetchedAt: Date.now() });
            failed++;
          }
        }),
      ),
    );
    return { computed: ok, failed, skipped: requests.length - todo.length };
  },
});
