import "server-only";
export const dropboxAppKey = () => (process.env.DROPBOX_APP_KEY ?? "").trim();
/** Dropbox Chooser "direct" links are served from these hosts only. */
export const isDropboxDirectLink = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.port && /(^|\.)dropboxusercontent\.com$/i.test(u.hostname);
  } catch { return false; }
};
