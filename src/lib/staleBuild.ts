// After a deploy, a tab opened on the previous version asks for JS chunks that no longer exist; the
// host answers with index.html and the lazy page fails to load. The fix is a reload (new index.html,
// new chunk names), done once automatically so it never shows as an error.

const KEY = "solis:stale-reload-at";
const WINDOW_MS = 30_000;

/** True for the errors a missing or HTML-served chunk produces in Chrome, Safari and Firefox. */
export function isStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to load module script|is not a valid JavaScript MIME type|ChunkLoadError|Unable to preload CSS/i.test(msg);
}

/** Reloads once per 30 s (a second failure in a row means something else is wrong: show the error). */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload, the browser cache will not loop since index.html is not cached.
  }
  window.location.reload();
  return true;
}

/** Vite fires this when a lazy chunk (or its CSS) fails to preload. */
export function installStaleBuildReload() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
