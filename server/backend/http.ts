export type ApiFailure = {
  code: string;
  message: string;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function fail(status: number, code: string, message: string) {
  return Response.json({ ok: false, error: { code, message } satisfies ApiFailure }, { status });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  const raw = await request.text();
  if (!raw.trim()) return null;
  return JSON.parse(raw) as T;
}

export function normalizeHandle(handle: string) {
  const trimmed = handle.trim().toLowerCase();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function now() {
  return new Date();
}
