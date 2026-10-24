// Input guards for public mutations/actions. Convex validators check types only; these check values.
// Messages are French: they reach the UI as-is.

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "YYYY-MM-DD", a real calendar day between 2000 and 2100. */
export function assertDay(value: string, what = "Date") {
  if (!DAY_RE.test(value)) throw new Error(`${what} invalide (attendu AAAA-MM-JJ) : ${value.slice(0, 20)}`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error(`${what} invalide : ${value}`);
  if (value < "2000-01-01" || value > "2100-12-31") throw new Error(`${what} hors limites : ${value}`);
}

/** Finite number, |x| <= max. */
export function assertAmount(value: number, what = "Montant", max = 10_000_000) {
  if (!Number.isFinite(value)) throw new Error(`${what} invalide`);
  if (Math.abs(value) > max) throw new Error(`${what} trop grand`);
}

export function assertMaxLength(value: string | undefined, max: number, what: string) {
  if (value !== undefined && value.length > max) throw new Error(`${what} trop long (${max} caractères max)`);
}

export function assertMaxItems(items: readonly unknown[], max: number, what: string) {
  if (items.length > max) throw new Error(`${what} : ${items.length} éléments, ${max} max par envoi`);
}

/** ISO 4217-style code: 3 letters. */
export function assertCurrency(value: string) {
  if (!/^[A-Za-z]{3}$/.test(value.trim())) throw new Error(`Devise invalide : ${value.slice(0, 10)}`);
}
