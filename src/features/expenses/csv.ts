// Bank CSV parser for French bank exports (Qonto, Shine, BNP Paribas, Société Générale, Crédit Agricole,
// Boursorama, Revolut) and generic CSVs. Pure functions: used by the import ViewModel, tested in isolation.
// Detects: encoding (UTF-8 / Windows-1252), delimiter (; , tab |), preamble lines before the header,
// headerless files, decimal comma, date format (DD/MM/YYYY, YYYY-MM-DD, DD-MM-YY...), debit/credit
// columns vs signed amount vs a debit/credit "side" column, currency and bank transaction id.

export type BankFormat = "qonto" | "revolut" | "boursorama" | "shine" | "sg" | "ca" | "bnp" | "generic";

export const FORMAT_LABELS: Record<BankFormat, string> = {
  qonto: "Qonto",
  revolut: "Revolut",
  boursorama: "Boursorama",
  shine: "Shine",
  sg: "Société Générale",
  ca: "Crédit Agricole",
  bnp: "BNP Paribas",
  generic: "CSV générique",
};

export type ParsedTx = {
  date: string; // YYYY-MM-DD
  label: string;
  amount: number; // signed: negative = money out
  currency: string;
  externalId: string;
  vendorHint?: string;
};

export type ColumnRole = "date" | "date2" | "label" | "vendorHint" | "amount" | "debit" | "credit" | "side" | "currency" | "id" | "status" | "type" | "fee";

export const ROLE_LABELS: Record<ColumnRole, string> = {
  date: "Date",
  date2: "Date (secours)",
  label: "Libellé",
  vendorHint: "Contrepartie",
  amount: "Montant",
  debit: "Débit",
  credit: "Crédit",
  side: "Sens",
  currency: "Devise",
  id: "Identifiant",
  status: "Statut",
  type: "Type",
  fee: "Frais",
};

export type ParseResult = {
  format: BankFormat;
  formatLabel: string;
  delimiter: string;
  decimalComma: boolean;
  dateFormat: string;
  headerless: boolean;
  columns: { role: ColumnRole; header: string }[];
  transactions: ParsedTx[];
  debits: ParsedTx[];
  creditCount: number;
  ignored: { reason: string; count: number }[];
  warnings: string[];
};

export type ParseOptions = { invertSign?: boolean };

/* ---------- decoding ---------- */

/** UTF-8 when valid, else Windows-1252 (BNP, SG and Crédit Agricole export Latin-1). */
export function decodeBytes(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/* ---------- low level CSV ---------- */

const DELIMITERS = [";", ",", "\t", "|"];

function countOutsideQuotes(line: string, delim: string) {
  let n = 0;
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) n++;
  }
  return n;
}

export function detectDelimiter(text: string): string {
  const lines = text.split("\n").filter((l) => l.trim()).slice(0, 40);
  let best = ";";
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d)).filter((c) => c > 0);
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [modal, hits] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = hits * 100 + modal;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseRecords(text: string, delim: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out.map((r) => r.map((c) => c.replace(/^="(.*)"$/, "$1").trim())).filter((r) => r.some((c) => c !== ""));
}

/* ---------- values ---------- */

export function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SPACES = /[\s  ']/g;

/** "1 234,56" / "-1.234,56" / "(12.50)" / "12,50-" / "€12.50" → number; null when empty or not a number. */
export function parseAmount(raw: string, decimalComma: boolean): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/(eur|usd|gbp|chf|€|\$|£)/gi, "").replace(SPACES, "");
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

type DateOrder = "dmy" | "mdy";

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDate(raw: string, order: DateOrder = "dmy"): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return order === "dmy" ? validDate(y, +m[2], +m[1]) : validDate(y, +m[1], +m[2]);
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
}

function looksLikeDate(raw: string) {
  return parseDate(raw, "dmy") != null || parseDate(raw, "mdy") != null;
}

/** 64-bit FNV-1a (two 32-bit lanes) as hex. Stable across sessions. */
export function hashKey(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000197) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/* ---------- column mapping ---------- */

const SYNONYMS: Record<ColumnRole, string[]> = {
  id: ["transaction id", "id de la transaction", "id transaction", "identifiant de transaction", "identifiant", "transaction_id", "numero de transaction", "reference de l operation", "id"],
  status: ["status", "statut", "state", "etat"],
  type: ["type", "type operation", "type d operation", "type de transaction"],
  currency: ["devise", "currency", "monnaie", "local currency", "devise locale"],
  side: ["debit credit", "sens", "side", "debit ou credit", "type de mouvement"],
  debit: ["debit", "debit euros", "debit eur", "montant debit", "debits", "sortie", "sorties"],
  credit: ["credit", "credit euros", "credit eur", "montant credit", "credits", "entree", "entrees"],
  amount: [
    "montant operation en euro", "montant de l operation", "montant operation", "montant", "amount", "total amount incl vat", "total amount",
    "montant total ttc", "montant ttc", "montant total", "amount eur", "montant eur", "montant en euros", "local amount", "value", "somme",
  ],
  date: [
    "date operation", "date de l operation", "date d operation", "dateop", "date op", "operation date", "operation date local", "operation date utc",
    "date de l operation utc", "date de transaction", "date de la transaction", "transaction date", "started date", "date comptable", "date",
    "date de comptabilisation", "booking date", "completed date", "settlement date", "settlement date local", "settlement date utc", "date de reglement",
  ],
  date2: ["completed date", "settlement date", "settlement date utc", "date de valeur", "dateval", "value date", "date valeur"],
  label: [
    "libelle operation", "libelle de l operation", "libelle", "libelle simplifie", "libelle court", "label", "description", "counterparty name",
    "nom de la contrepartie", "contrepartie", "beneficiaire", "detail de l ecriture", "detail", "nature de l operation", "nature", "communication",
    "reference", "merchant", "marchand", "payee", "nom", "name", "intitule", "motif",
  ],
  vendorHint: ["counterparty name", "nom de la contrepartie", "contrepartie", "supplierfound", "merchant", "marchand", "beneficiaire", "payee"],
  fee: ["fee", "frais"],
};

const NOT_AMOUNT = /^(vat|tva)\b|\b(vat|tva) amount|montant (de )?(la )?(tva|vat)|balance|solde|^fee|^frais|taux|rate|exchange/;

function mapColumns(headers: string[]): Partial<Record<ColumnRole, number>> & { labels: number[] } {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const map: Partial<Record<ColumnRole, number>> = {};
  const pick = (role: ColumnRole, exclusive = true, guard?: (h: string) => boolean) => {
    for (const pass of ["exact", "prefix"] as const) {
      for (const syn of SYNONYMS[role]) {
        const idx = norm.findIndex((h, i) => (!exclusive || !used.has(i)) && (!guard || guard(h)) && (pass === "exact" ? h === syn : h.startsWith(`${syn} `)));
        if (idx >= 0) {
          map[role] = idx;
          if (exclusive) used.add(idx);
          return;
        }
      }
    }
  };
  pick("id");
  pick("status");
  pick("currency", true, (h) => !h.includes("account") && !h.includes("compte"));
  pick("side", true, (h) => !(h === "debit" || h === "credit"));
  // A column named "Débit / Crédit" holds the side, not an amount.
  pick("debit", true, (h) => !h.includes("credit"));
  pick("credit", true, (h) => !h.includes("debit"));
  if (map.debit == null || map.credit == null) {
    if (map.debit != null) used.delete(map.debit);
    if (map.credit != null) used.delete(map.credit);
    delete map.debit;
    delete map.credit;
  }
  if (map.debit == null) pick("amount", true, (h) => !NOT_AMOUNT.test(h));
  pick("fee", true, (h) => h === "fee" || h === "frais");
  pick("date");
  pick("date2");
  pick("type", true);
  pick("vendorHint", false);
  // Every label-like column, in priority order; they are joined (BNP "Libellé court" + "Libellé opération", SG "Libellé" + "Détail").
  const labels: number[] = [];
  for (const syn of SYNONYMS.label) {
    norm.forEach((h, i) => {
      if (used.has(i) || labels.includes(i)) return;
      if (h === syn || h.startsWith(`${syn} `)) labels.push(i);
    });
  }
  if (map.vendorHint != null && !labels.includes(map.vendorHint) && !labels.length) labels.push(map.vendorHint);
  if (labels.length) map.label = labels[0];
  return { ...map, labels: labels.slice(0, 3) };
}

function detectFormat(headers: string[], fileName: string, preamble: string): BankFormat {
  const h = headers.map(normHeader);
  const has = (s: string) => h.some((x) => x === s || x.startsWith(`${s} `));
  const file = fileName.toLowerCase();
  if (has("counterparty name") || has("nom de la contrepartie") || file.includes("qonto")) return "qonto";
  if ((has("started date") && has("state")) || file.includes("revolut")) return "revolut";
  if (has("dateop") || has("supplierfound") || file.includes("boursorama") || file.startsWith("export-operations")) return "boursorama";
  if (file.includes("shine")) return "shine";
  if (has("detail de l ecriture") || has("montant de l operation") || file.includes("societe") || file.includes("sg")) return "sg";
  if ((has("debit euros") && has("credit euros")) || file.includes("credit agricole") || file.startsWith("ca")) return "ca";
  if (has("montant operation en euro") || has("libelle court") || file.includes("bnp") || /bnp|compte de cheques/i.test(preamble)) return "bnp";
  return "generic";
}

/* ---------- main ---------- */

const SKIP_STATUS = /^(declined|reverted|failed|canceled|cancelled|refused|refusee|refuse|annulee|annule|rejected|pending|en attente|reversed)$/;

export function parseBankCsv(input: string, fileName: string, options: ParseOptions = {}): ParseResult {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) throw new Error("Le fichier est vide.");
  const delimiter = detectDelimiter(text);
  const records = parseRecords(text, delimiter);
  if (records.length < 2 && !(records.length === 1 && looksLikeDate(records[0][0] ?? ""))) throw new Error("Aucune ligne exploitable dans ce fichier.");

  // Header: the first record with a date-like and an amount-like column name.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(records.length, 40); i++) {
    const n = records[i].map(normHeader);
    const hasDate = n.some((h) => h.includes("date") || h === "dateop");
    const hasAmount = n.some((h) => /(montant|amount|debit|credit|value|somme)/.test(h));
    if (hasDate && hasAmount && !records[i].some((c) => looksLikeDate(c))) {
      headerIdx = i;
      break;
    }
  }

  const warnings: string[] = [];
  let headers: string[];
  let body: string[][];
  let cols: Partial<Record<ColumnRole, number>> & { labels: number[] };
  const headerless = headerIdx < 0;
  if (!headerless) {
    headers = records[headerIdx];
    body = records.slice(headerIdx + 1);
    cols = mapColumns(headers);
  } else {
    // No header (old BNP / SG exports): infer columns from content.
    body = records.filter((r) => r.length >= 3 && r.some((c) => looksLikeDate(c)));
    if (!body.length) throw new Error("Impossible de trouver l'en-tête ni des lignes datées.");
    const width = Math.max(...body.map((r) => r.length));
    headers = Array.from({ length: width }, (_, i) => `Colonne ${i + 1}`);
    const share = (i: number, test: (s: string) => boolean) => body.filter((r) => r[i] && test(r[i])).length / body.length;
    const dateCol = headers.findIndex((_, i) => share(i, looksLikeDate) > 0.8);
    const numCols = headers.map((_, i) => i).filter((i) => i !== dateCol && share(i, (s) => parseAmount(s, true) != null || parseAmount(s, false) != null) > 0.3 && !body.every((r) => !r[i] || looksLikeDate(r[i])));
    const textCols = headers.map((_, i) => i).filter((i) => i !== dateCol && !numCols.includes(i));
    const avgLen = (i: number) => body.reduce((s, r) => s + (r[i]?.length ?? 0), 0) / body.length;
    textCols.sort((a, b) => avgLen(b) - avgLen(a));
    cols = { labels: textCols.slice(0, 1) };
    if (dateCol >= 0) cols.date = dateCol;
    if (textCols.length) cols.label = textCols[0];
    const exclusive = numCols.length >= 2 && body.every((r) => !(r[numCols[0]] && r[numCols[1]]));
    if (exclusive) {
      cols.debit = numCols[0];
      cols.credit = numCols[1];
    } else if (numCols.length) cols.amount = numCols[0];
    warnings.push("Fichier sans en-tête : colonnes déduites du contenu, vérifie l'aperçu.");
  }

  if (cols.date == null) throw new Error("Colonne de date introuvable.");
  if (cols.amount == null && cols.debit == null) throw new Error("Colonne de montant introuvable (Montant, ou Débit et Crédit).");
  if (!cols.labels.length) throw new Error("Colonne de libellé introuvable.");

  const format = detectFormat(headerless ? [] : headers, fileName, records.slice(0, Math.max(0, headerIdx)).flat().join(" "));

  // Decimal comma vs dot, over every amount cell.
  const amountCols = [cols.amount, cols.debit, cols.credit, cols.fee].filter((c): c is number => c != null);
  let comma = 0;
  let dot = 0;
  for (const r of body) {
    for (const c of amountCols) {
      const s = (r[c] ?? "").replace(SPACES, "");
      if (/,\d{1,2}-?$/.test(s)) comma++;
      else if (/\.\d{1,2}-?$/.test(s)) dot++;
    }
  }
  const decimalComma = comma > 0 ? comma >= dot : delimiter !== "," && dot === 0;

  // Day/month order: French by default, US when a value proves it.
  let order: DateOrder = "dmy";
  let isoDates = 0;
  for (const r of body) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]/.exec(r[cols.date] ?? "");
    if (m && +m[2] > 12 && +m[1] <= 12) order = "mdy";
    if (/^\d{4}-/.test(r[cols.date] ?? "")) isoDates++;
  }
  const dateFormat = isoDates > body.length / 2 ? "AAAA-MM-JJ" : order === "dmy" ? "JJ/MM/AAAA" : "MM/JJ/AAAA";

  const ignored = new Map<string, number>();
  const bump = (reason: string) => ignored.set(reason, (ignored.get(reason) ?? 0) + 1);
  const occurrences = new Map<string, number>();
  const transactions: ParsedTx[] = [];
  let unreadableSample = "";

  for (const r of body) {
    if (headerless === false && r.length < 2) continue;
    const date = parseDate(r[cols.date] ?? "", order) ?? (cols.date2 != null ? parseDate(r[cols.date2] ?? "", order) : null);
    const status = cols.status != null ? normHeader(r[cols.status] ?? "") : "";
    const type = cols.type != null ? normHeader(r[cols.type] ?? "") : "";
    if (status && SKIP_STATUS.test(status)) {
      bump("refusées, annulées ou en attente");
      continue;
    }
    if (type === "exchange" || type === "change") {
      bump("changes de devises internes");
      continue;
    }
    let amount: number | null;
    if (cols.debit != null && cols.credit != null) {
      const d = parseAmount(r[cols.debit] ?? "", decimalComma);
      const c = parseAmount(r[cols.credit] ?? "", decimalComma);
      amount = d ? -Math.abs(d) : c ? Math.abs(c) : d === 0 || c === 0 ? 0 : null;
    } else {
      amount = parseAmount(r[cols.amount as number] ?? "", decimalComma);
      if (amount != null && cols.side != null) {
        const side = normHeader(r[cols.side] ?? "");
        if (/^(debit|d|out|sortie|-)/.test(side)) amount = -Math.abs(amount);
        else if (/^(credit|c|in|entree|\+)/.test(side)) amount = Math.abs(amount);
      }
    }
    if (amount != null && options.invertSign) amount = -amount;
    if (amount != null && cols.fee != null && amount < 0) {
      const fee = parseAmount(r[cols.fee] ?? "", decimalComma);
      if (fee) amount -= Math.abs(fee);
    }
    if (!date || amount == null) {
      bump("illisibles (date ou montant)");
      if (!unreadableSample) unreadableSample = r.join(" | ").slice(0, 120);
      continue;
    }
    if (amount === 0) {
      bump("à montant nul");
      continue;
    }
    const parts: string[] = [];
    for (const c of cols.labels) {
      const val = (r[c] ?? "").replace(/\s+/g, " ").trim();
      if (!val || parts.some((p) => p.toLowerCase().includes(val.toLowerCase()))) continue;
      const covered = parts.findIndex((p) => val.toLowerCase().includes(p.toLowerCase()));
      if (covered >= 0) parts[covered] = val;
      else parts.push(val);
    }
    const label = parts.join(" · ").slice(0, 240) || "(sans libellé)";
    const currency = ((cols.currency != null ? r[cols.currency] : "") || "EUR").trim().toUpperCase().replace("€", "EUR").slice(0, 3) || "EUR";
    const hint = cols.vendorHint != null ? (r[cols.vendorHint] ?? "").trim() || undefined : undefined;
    const bankId = cols.id != null ? (r[cols.id] ?? "").trim() : "";
    let externalId: string;
    if (bankId) externalId = `${format}:${bankId}`;
    else {
      const base = `${date}|${label.toLowerCase().replace(/\s+/g, " ")}|${Math.abs(amount).toFixed(2)}|${currency}`;
      const occ = occurrences.get(base) ?? 0;
      occurrences.set(base, occ + 1);
      externalId = `h:${hashKey(`${base}|${occ}`)}`;
    }
    transactions.push({ date, label, amount: Math.round(amount * 100) / 100, currency, externalId, vendorHint: hint });
  }

  if (unreadableSample) warnings.push(`Exemple de ligne illisible : ${unreadableSample}`);
  const debits = transactions.filter((t) => t.amount < 0);
  const creditCount = transactions.length - debits.length;
  if (transactions.length && !debits.length && !options.invertSign) warnings.push("Aucun débit détecté : si les dépenses sont en positif dans ce fichier, inverse les signes.");

  const columns: { role: ColumnRole; header: string }[] = [];
  for (const role of Object.keys(ROLE_LABELS) as ColumnRole[]) {
    const idx = (cols as Partial<Record<ColumnRole, number>>)[role];
    if (role === "label") {
      cols.labels.forEach((i) => columns.push({ role, header: headers[i] }));
    } else if (idx != null) columns.push({ role, header: headers[idx] });
  }

  return {
    format,
    formatLabel: FORMAT_LABELS[format],
    delimiter,
    decimalComma,
    dateFormat,
    headerless,
    columns,
    transactions,
    debits,
    creditCount,
    ignored: [...ignored].map(([reason, count]) => ({ reason, count })),
    warnings,
  };
}
