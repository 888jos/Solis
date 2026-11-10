// fetch with retries for flaky APIs: retries 429, 5xx and network errors with a growing backoff.
// Other statuses (4xx) come back at once so the caller reports them as they are.
// Works in both Convex runtimes (actions only: it waits with setTimeout).

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchRetry(url: string, init?: RequestInit, opts: { retries?: number; baseDelayMs?: number } = {}): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 1500;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(base * (attempt + 1));
      continue;
    }
    if (!isRetryable(res.status) || attempt >= retries) return res;
    // Honour Retry-After (seconds) when the API sends one, capped so an action never stalls for long.
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : base * (attempt + 1);
    await res.body?.cancel().catch(() => undefined);
    await sleep(wait);
  }
}
