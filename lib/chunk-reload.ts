/** After an update, a page left open can ask for files that no longer exist. Reload once to get the new version. */
export const isStaleBuild = (msg: string) =>
  /ChunkLoadError|Loading chunk [\w/-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);

export function reloadOnce() {
  try {
    const k = "overlap-update-reload";
    const last = Number(sessionStorage.getItem(k)) || 0;
    if (Date.now() - last < 30_000) return false; // don't loop if something else is wrong
    sessionStorage.setItem(k, String(Date.now()));
  } catch {}
  window.location.reload();
  return true;
}
