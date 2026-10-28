// Shared folders: a Space shared by private link with people outside the workspace.
// Pure helpers (no server or browser APIs), shared by the API, the pages and tests.

export const SHARE_MODES = ["view", "contribute", "collect"] as const;
export type ShareMode = (typeof SHARE_MODES)[number];

export const SHARE_MODE_INFO: Record<ShareMode, { label: string; text: string }> = {
  view: { label: "View & download", text: "People with the link can see and download the files." },
  contribute: { label: "View & add files", text: "People can see, download and add files — good for a team or project." },
  collect: { label: "Collect files only", text: "People can hand files in but can't see anyone else's — good for assignments and documents from clients." }
};

export const SHARE_EXPIRY_DAYS = [1, 7, 30, 0] as const; // 0 = no expiry
export const MAX_SHARES_PER_SPACE = 10;
export const SHARE_LABEL_MAX = 80;
export const GUEST_NAME_MAX = 80;
/** Guest uploads: per link, at most this many in 10 minutes and in total. */
export const GUEST_UPLOADS_PER_10_MIN = 30;
export const GUEST_UPLOADS_TOTAL = 1000;
export const SHARED_LIST_LIMIT = 300;

export type ShareRow = {
  id: string; space_id: string; workspace_id: string; token: string; label: string | null; mode: ShareMode;
  created_by: string; expires_at: string | null; revoked_at: string | null;
  view_count: number; upload_count: number; last_used_at: string | null; created_at: string;
};

export const isShareMode = (v: unknown): v is ShareMode => typeof v === "string" && (SHARE_MODES as readonly string[]).includes(v);
export const canSeeFiles = (mode: ShareMode) => mode !== "collect";
export const canUpload = (mode: ShareMode) => mode !== "view";

/** Tokens are 32 URL-safe characters (192 bits). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Why a link can't be used right now, or null if it's fine. */
export function shareBlock(s: Pick<ShareRow, "revoked_at" | "expires_at">, now = new Date()): "revoked" | "expired" | null {
  if (s.revoked_at) return "revoked";
  if (s.expires_at && new Date(s.expires_at).getTime() <= now.getTime()) return "expired";
  return null;
}

export function expiryFromDays(days: number, now = new Date()): string | null {
  return days > 0 ? new Date(now.getTime() + days * 86_400_000).toISOString() : null;
}

/** A guest's file is saved as "Name – file.pdf" so members can see who sent it anywhere in the app. */
export function guestFilename(guest: string, filename: string): string {
  const name = cleanText(filename, 200) || "file";
  return `${guest} – ${name}`.slice(0, 255);
}

/** Storage key for a guest upload: under the link creator's folder, like any upload. */
export function guestObjectPrefix(workspaceId: string, creatorId: string, fileId: string): string {
  return `${workspaceId}/${creatorId}/${fileId}-`;
}

export function sharePath(token: string): string {
  return `/f/${token}`;
}
