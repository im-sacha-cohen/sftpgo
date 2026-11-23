// After a new build is deployed, a tab still running the previous one asks for
// page chunks that no longer exist (their names carry a content hash) and the
// route crashes with "Failed to fetch dynamically imported module". Reloading
// fetches the new index.html and the right chunks. A timestamp in
// sessionStorage stops reload loops when the chunk is really missing.

const KEY = 'sftpgo-console-chunk-reload';
const WINDOW_MS = 10_000;

/** Reloads the page once per 10 s; returns false when it just did (give up). */
export function reloadForNewBuild(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    /* storage unavailable */
  }
  if (Date.now() - last < WINDOW_MS) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable: still reload once */
  }
  window.location.reload();
  return true;
}

/** Wraps a lazy page loader so a missing chunk reloads the app instead of crashing. */
export function withReload<T>(loader: () => Promise<T>): () => Promise<T> {
  return () =>
    loader().catch((err) => {
      if (reloadForNewBuild()) return new Promise<T>(() => {});
      throw err;
    });
}

/** Vite reports failed preloads (CSS/JS deps of a chunk) with this event. */
export function installPreloadErrorReload() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
