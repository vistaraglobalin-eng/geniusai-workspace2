import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { open, seal } from "./crypto";

// Microsoft OneDrive (personal and work/school) through Microsoft Graph.
export const MS_SCOPES = ["offline_access", "User.Read", "Files.ReadWrite"];
export const ONEDRIVE_FOLDER = "GeniusAI Workspace";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

export function msConfig() {
  const clientId = process.env.MS_CLIENT_ID?.trim(), clientSecret = process.env.MS_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export const msRedirect = (origin: string) => `${origin}/api/integrations/onedrive/callback`;
export const msAuthorizeUrl = (clientId: string, origin: string, state: string, loginHint?: string | null) =>
  `${AUTH}/authorize?${new URLSearchParams({ client_id: clientId, response_type: "code", redirect_uri: msRedirect(origin), response_mode: "query", scope: MS_SCOPES.join(" "), state, prompt: "select_account", ...(loginHint ? { login_hint: loginHint } : {}) })}`;

export class MsError extends Error {
  constructor(public code: "not_configured" | "not_connected" | "reconnect" | "drive_error" | "too_large", message: string) { super(message); }
}

async function tokenRequest(params: Record<string, string>) {
  const cfg = msConfig();
  if (!cfg) throw new MsError("not_configured", "OneDrive isn't set up on this server yet.");
  const res = await fetch(`${AUTH}/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: MS_SCOPES.join(" "), ...params }), signal: AbortSignal.timeout(15_000)
  });
  return { ok: res.ok, t: (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; scope?: string } };
}

export async function msConnect(admin: SupabaseClient, userId: string, code: string, origin: string) {
  const { ok, t } = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: msRedirect(origin) });
  if (!ok || !t.access_token || !t.refresh_token) throw new MsError("drive_error", "Microsoft didn't accept the sign-in. Please try again.");
  let email: string | null = null;
  try {
    const me = (await (await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(10_000) })).json()) as { mail?: string; userPrincipalName?: string };
    email = (me.mail || me.userPrincipalName || "").slice(0, 254) || null;
  } catch { /* optional */ }
  const { error } = await admin.from("user_integrations").upsert({ user_id: userId, provider: "onedrive", account_email: email, token_enc: seal(t.refresh_token), scopes: t.scope ?? null, updated_at: new Date().toISOString() });
  if (error) throw new MsError("drive_error", /check constraint|does not exist|schema cache/i.test(error.message) ? "OneDrive needs a one-time database update first." : "The connection couldn't be saved.");
}

/** Fresh access token; Microsoft also rotates the refresh token, so the new one is stored. */
export async function msToken(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("user_integrations").select("token_enc").eq("user_id", userId).eq("provider", "onedrive").maybeSingle();
  const refresh = data ? open((data as { token_enc: string }).token_enc) : null;
  if (!refresh) throw new MsError("not_connected", "Connect OneDrive first in Account → Connected apps.");
  const { ok, t } = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (!ok || !t.access_token) {
    if (t.error === "invalid_grant") { await admin.from("user_integrations").delete().eq("user_id", userId).eq("provider", "onedrive"); throw new MsError("reconnect", "OneDrive access has expired. Please connect OneDrive again."); }
    throw new MsError("drive_error", "OneDrive isn't responding. Please try again.");
  }
  if (t.refresh_token && t.refresh_token !== refresh) await admin.from("user_integrations").update({ token_enc: seal(t.refresh_token), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", "onedrive");
  return t.access_token;
}

export async function msDisconnect(admin: SupabaseClient, userId: string) {
  await admin.from("user_integrations").delete().eq("user_id", userId).eq("provider", "onedrive");
}

async function graph(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 401) throw new MsError("reconnect", "OneDrive access has expired. Please connect OneDrive again.");
  return res;
}

export type DriveItem = { id: string; name: string; folder: boolean; size: number; modified: string };
type Raw = { id: string; name: string; size?: number; folder?: unknown; file?: unknown; lastModifiedDateTime?: string };
const ITEM_ID = /^[A-Za-z0-9!._-]{1,200}$/;
export const isItemId = (id: string) => ITEM_ID.test(id);

/** Folder contents (or search results), folders first. */
export async function msList(token: string, o: { folder?: string | null; q?: string | null }): Promise<{ items: DriveItem[]; name: string }> {
  const select = "$select=id,name,size,folder,file,lastModifiedDateTime&$top=200";
  let url: string, name = "OneDrive";
  if (o.q) url = `/me/drive/root/search(q='${encodeURIComponent(o.q.replace(/'/g, "''"))}')?${select}`;
  else if (o.folder && isItemId(o.folder)) {
    url = `/me/drive/items/${o.folder}/children?${select}`;
    const m = await graph(token, `/me/drive/items/${o.folder}?$select=name`);
    name = ((await m.json().catch(() => ({}))) as { name?: string }).name ?? "Folder";
  } else url = `/me/drive/root/children?${select}`;
  const res = await graph(token, url);
  if (!res.ok) throw new MsError("drive_error", "OneDrive couldn't list these files.");
  const raw = ((await res.json()) as { value?: Raw[] }).value ?? [];
  const items = raw.filter((r) => r.folder || r.file).map((r) => ({ id: r.id, name: r.name, folder: !!r.folder, size: r.size ?? 0, modified: r.lastModifiedDateTime ?? "" }));
  items.sort((a, b) => (a.folder === b.folder ? a.name.localeCompare(b.name) : a.folder ? -1 : 1));
  return { items, name };
}

export async function msDownload(token: string, id: string, maxBytes: number): Promise<{ name: string; bytes: Uint8Array }> {
  if (!isItemId(id)) throw new MsError("drive_error", "That file can't be opened.");
  const meta = await graph(token, `/me/drive/items/${id}?$select=name,size,file`);
  const m = (await meta.json().catch(() => ({}))) as { name?: string; size?: number; file?: unknown };
  if (!meta.ok || !m.file) throw new MsError("drive_error", "That OneDrive file couldn't be opened.");
  if ((m.size ?? 0) > maxBytes) throw new MsError("too_large", `${m.name}: files can be up to 25 MB.`);
  const res = await graph(token, `/me/drive/items/${id}/content`);
  if (!res.ok) throw new MsError("drive_error", `${m.name}: the download didn't work.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new MsError("too_large", `${m.name}: files can be up to 25 MB.`);
  return { name: (m.name ?? "OneDrive file").slice(0, 200), bytes };
}

/** Saves into "GeniusAI Workspace" in the person's OneDrive (renames if a file with that name exists). */
export async function msUpload(token: string, name: string, bytes: Uint8Array): Promise<string | null> {
  const safe = name.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").replace(/ +\./g, ".").trim().slice(0, 200) || "file";
  const path = `/me/drive/root:/${encodeURIComponent(ONEDRIVE_FOLDER)}/${encodeURIComponent(safe)}`;
  const session = await graph(token, `${path}:/createUploadSession`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }) });
  const s = (await session.json().catch(() => ({}))) as { uploadUrl?: string };
  if (!session.ok || !s.uploadUrl) throw new MsError("drive_error", "OneDrive didn't accept the upload.");
  if (!bytes.byteLength) throw new MsError("drive_error", "This file is empty.");
  const CHUNK = 320 * 1024 * 10; // must be a multiple of 320 KiB
  let last: Response | null = null;
  for (let start = 0; start < bytes.byteLength; start += CHUNK) {
    const end = Math.min(bytes.byteLength, start + CHUNK);
    // The upload URL is pre-authorised; Microsoft asks that no Authorization header is sent to it.
    last = await fetch(s.uploadUrl, { method: "PUT", headers: { "content-length": String(end - start), "content-range": `bytes ${start}-${end - 1}/${bytes.byteLength}` }, body: new Uint8Array(bytes.subarray(start, end)), signal: AbortSignal.timeout(60_000) });
    if (!last.ok && last.status !== 202) throw new MsError("drive_error", "The upload to OneDrive stopped. Please try again.");
    if (end >= bytes.byteLength) break;
  }
  const done = last ? ((await last.json().catch(() => ({}))) as { webUrl?: string }) : {};
  return done.webUrl ?? null;
}
