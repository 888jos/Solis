// The access token is handed over once through a link (/?k=TOKEN) and kept on the device.
const KEY = "solis.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode: the token lives for this tab only */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Reads ?k= from the URL once, stores it and strips it from the address bar. */
export function captureTokenFromUrl() {
  const url = new URL(window.location.href);
  const k = url.searchParams.get("k");
  if (!k) return;
  setToken(k);
  url.searchParams.delete("k");
  window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
}
