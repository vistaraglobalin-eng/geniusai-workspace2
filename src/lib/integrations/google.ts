import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { open, seal } from "./crypto";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];
export const DRIVE_FOLDER = "GeniusAI Workspace";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim(), clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret
    ? { clientId, clientSecret, apiKey: process.env.GOOGLE_API_KEY?.trim() || "", projectNumber: (process.env.GOOGLE_PROJECT_NUMBER ?? "").replace(/\D/g, "") }
    : null;
}
export const redirectUri = (origin: string) => `${origin}/api/integrations/google/callback`;

export class GoogleError extends Error {
  constructor(public code: "not_configured" | "not_connected" | "reconnect" | "drive_error" | "too_large", message: string) { super(message); }
}

/** Exchanges the sign-in code and saves the (encrypted) refresh token. */
export async function connectWithCode(admin: SupabaseClient, userId: string, code: string, origin: string) {
  const cfg = googleConfig();
  if (!cfg) throw new GoogleError("not_configured", "Google Drive isn't set up on this server yet.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000)
  });
  const t = (await res.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; id_token?: string; scope?: string };
  if (!res.ok || !t.access_token) throw new GoogleError("drive_error", "Google didn't accept the sign-in. Please try again.");
  let email: string | null = null;
  try { email = (JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString()) as { email?: string }).email ?? null; } catch { /* optional */ }
  if (!t.refresh_token) {
    // Google only sends a refresh token the first time; keep the one we have if this is a reconnect.
    const { data } = await admin.from("user_integrations").select("user_id").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (!data) throw new GoogleError("reconnect", "Google didn't give long-term access. Remove GeniusAI from your Google account's third-party access, then connect again.");
    await admin.from("user_integrations").update({ account_email: email, scopes: t.scope ?? null, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", "google");
    return email;
  }
  const { error } = await admin.from("user_integrations").upsert({
    user_id: userId, provider: "google", account_email: email, token_enc: seal(t.refresh_token), scopes: t.scope ?? null, updated_at: new Date().toISOString()
  });
  if (error) throw new GoogleError("drive_error", /does not exist|schema cache/i.test(error.message) ? "Connected apps need a one-time database update first." : "The connection couldn't be saved.");
  return email;
}

/** A fresh access token for this person (valid about an hour). */
export async function accessToken(admin: SupabaseClient, userId: string): Promise<string> {
  const cfg = googleConfig();
  if (!cfg) throw new GoogleError("not_configured", "Google Drive isn't set up on this server yet.");
  const { data } = await admin.from("user_integrations").select("token_enc").eq("user_id", userId).eq("provider", "google").maybeSingle();
  const refresh = data ? open((data as { token_enc: string }).token_enc) : null;
  if (!refresh) throw new GoogleError("not_connected", "Connect Google Drive first.");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000)
  });
  const t = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !t.access_token) {
    if (t.error === "invalid_grant") { await admin.from("user_integrations").delete().eq("user_id", userId).eq("provider", "google"); throw new GoogleError("reconnect", "Google access has expired or was removed. Please connect Google Drive again."); }
    throw new GoogleError("drive_error", "Google Drive isn't responding. Please try again.");
  }
  return t.access_token;
}

export async function revoke(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from("user_integrations").select("token_enc").eq("user_id", userId).eq("provider", "google").maybeSingle();
  const refresh = data ? open((data as { token_enc: string }).token_enc) : null;
  if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  await admin.from("user_integrations").delete().eq("user_id", userId).eq("provider", "google");
}

async function drive(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 401) throw new GoogleError("reconnect", "Google access has expired. Please connect Google Drive again.");
  return res;
}

/** The app's own folder in the person's Drive (created on first use). */
async function folderId(token: string): Promise<string> {
  const q = encodeURIComponent(`name = '${DRIVE_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const found = await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  const list = (await found.json().catch(() => ({}))) as { files?: { id: string }[] };
  if (list.files?.[0]?.id) return list.files[0].id;
  const made = await drive(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: "application/vnd.google-apps.folder" })
  });
  const f = (await made.json().catch(() => ({}))) as { id?: string };
  if (!f.id) throw new GoogleError("drive_error", "The folder couldn't be created in Google Drive.");
  return f.id;
}

/** Uploads a file into "GeniusAI Workspace" in the person's Drive. */
export async function uploadToDrive(token: string, file: { name: string; mime: string; bytes: Uint8Array }): Promise<{ id: string; link: string | null }> {
  const parent = await folderId(token);
  const boundary = `ga${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = JSON.stringify({ name: file.name, parents: [parent] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.mime}\r\n\r\n`,
    new Uint8Array(file.bytes), `\r\n--${boundary}--`
  ]);
  const res = await drive(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body
  });
  const f = (await res.json().catch(() => ({}))) as { id?: string; webViewLink?: string };
  if (!res.ok || !f.id) throw new GoogleError("drive_error", "The file couldn't be saved to Google Drive.");
  return { id: f.id, link: f.webViewLink ?? null };
}

const GOOGLE_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  "application/vnd.google-apps.presentation": { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" }
};

/** Downloads a file the person picked in Drive (Google Docs/Sheets/Slides become Word/Excel/PowerPoint). */
export async function downloadFromDrive(token: string, id: string, maxBytes: number): Promise<{ name: string; mime: string; bytes: Uint8Array }> {
  const metaRes = await drive(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size`);
  const meta = (await metaRes.json().catch(() => ({}))) as { name?: string; mimeType?: string; size?: string };
  if (!metaRes.ok || !meta.mimeType) throw new GoogleError("drive_error", "That Drive file couldn't be opened. Pick it again from the Drive window.");
  const exp = GOOGLE_EXPORT[meta.mimeType];
  if (!exp && meta.mimeType.startsWith("application/vnd.google-apps.")) throw new GoogleError("drive_error", "This kind of Google file can't be brought in. Choose a document, sheet, slide deck, PDF or image.");
  if (!exp && Number(meta.size ?? 0) > maxBytes) throw new GoogleError("too_large", "Files can be up to 25 MB.");
  const url = exp
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exp.mime)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`;
  const res = await drive(token, url);
  if (!res.ok) throw new GoogleError("drive_error", "That Drive file couldn't be downloaded.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new GoogleError("too_large", "Files can be up to 25 MB.");
  const base = (meta.name ?? "Drive file").slice(0, 200);
  return { name: exp && !base.toLowerCase().endsWith(`.${exp.ext}`) ? `${base}.${exp.ext}` : base, mime: exp ? exp.mime : meta.mimeType, bytes };
}

export type SetupCheck = { label: string; ok: boolean; fix?: string };

/** Checks the Google settings in Vercel for common mix-ups, without revealing any value. */
export function googleSetupChecks(): SetupCheck[] {
  const id = process.env.GOOGLE_CLIENT_ID?.trim() ?? "", secret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const key = process.env.GOOGLE_API_KEY?.trim() ?? "", rawNum = process.env.GOOGLE_PROJECT_NUMBER?.trim() ?? "";
  const num = rawNum.replace(/\D/g, "");
  const idNum = /^(\d+)-/.exec(id)?.[1] ?? "";
  const swapped = (v: string) => (v.startsWith("GOCSPX-") ? " It contains the Client secret instead." : v.endsWith(".apps.googleusercontent.com") ? " It contains the Client ID instead." : v.startsWith("AIza") ? " It contains the API key instead." : "");
  return [
    { label: "GOOGLE_CLIENT_ID", ok: /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id),
      fix: id ? `Should end with .apps.googleusercontent.com.${swapped(id)}` : "Missing in Vercel." },
    { label: "GOOGLE_CLIENT_SECRET", ok: /^GOCSPX-[A-Za-z0-9_-]{20,}$/.test(secret),
      fix: secret ? `Should start with GOCSPX-.${swapped(secret)}` : "Missing in Vercel." },
    { label: "GOOGLE_API_KEY", ok: /^AIza[0-9A-Za-z_-]{35}$/.test(key),
      fix: !key ? "Missing in Vercel." : key.startsWith("AIza") ? `Starts right but has the wrong length (${key.length} characters; should be 39). Copy it again with Show key.` : `Should start with AIza and be 39 characters.${swapped(key)}` },
    { label: "GOOGLE_PROJECT_NUMBER", ok: /^\d{6,15}$/.test(num) && num === rawNum.replace(/\s/g, "") && (!idNum || idNum === num),
      fix: !num ? "Missing in Vercel." : num !== rawNum.replace(/\s/g, "") ? "Use digits only (the Project number, not the Project ID)." : idNum && idNum !== num ? "Doesn't match the Client ID's project. Use the Project number of the project where you made the Client ID." : "Should be the 12-digit Project number." }
  ];
}
