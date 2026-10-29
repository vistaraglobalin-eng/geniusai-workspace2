"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileText, FolderOpen, Image as ImageIcon, Loader2, Upload, XCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ALLOWED_MIME_TYPES, FILES_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { GUEST_NAME_MAX, SHARE_MODE_INFO, canSeeFiles, canUpload, type ShareMode } from "@/lib/shares";

export type SharedFile = { id: string; name: string; mime: string; size: number; createdAt: string };
type Sent = { key: string; name: string; status: "uploading" | "done" | "error"; message?: string };

const NAME_KEY = "gai_guest_name";
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function postJson(url: string, body: object): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** What a guest sees on a shared-folder link: the files (unless it's collect-only) and, if allowed, an upload box. */
export function SharedFolder({ token, spaceName, workspaceName, label, mode, expiresAt, files, total }: {
  token: string; spaceName: string; workspaceName: string; label: string | null; mode: ShareMode; expiresAt: string | null; files: SharedFile[]; total: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [guest, setGuest] = useState("");
  const [sent, setSent] = useState<Sent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setGuest(localStorage.getItem(NAME_KEY) ?? ""); } catch { /* private mode */ }
  }, []);

  async function uploadOne(file: File, key: string, name: string): Promise<void> {
    const update = (patch: Partial<Sent>) => setSent((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    if (file.size > MAX_UPLOAD_BYTES) return update({ status: "error", message: "Larger than 25 MB" });
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) return update({ status: "error", message: "This file type isn't accepted" });
    try {
      const start = await postJson(`/api/shared/${token}/upload`, { filename: file.name, size: file.size, type: file.type, guestName: name });
      if (!start.ok) return update({ status: "error", message: String(start.data.message ?? "Couldn't start the upload") });
      const { path, uploadToken, fileId } = start.data as { path: string; uploadToken: string; fileId: string };
      const { error: upErr } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).uploadToSignedUrl(path, uploadToken, file, { contentType: file.type });
      if (upErr) return update({ status: "error", message: "The upload didn't go through" });
      const done = await postJson(`/api/shared/${token}/complete`, { fileId, filename: file.name, guestName: name });
      if (!done.ok) return update({ status: "error", message: String(done.data.message ?? "Couldn't save the file") });
      update({ status: "done" });
    } catch {
      update({ status: "error", message: "The connection dropped" });
    }
  }

  async function send(list: FileList | null) {
    const name = guest.trim();
    if (!list || list.length === 0) return;
    if (!name) { setError("Please enter your name first."); return; }
    setError(null); setBusy(true);
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
    const picked = Array.from(list).slice(0, 20);
    const items = picked.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, status: "uploading" as const }));
    setSent((s) => [...items, ...s]);
    for (let i = 0; i < picked.length; i++) await uploadOne(picked[i], items[i].key, name); // one at a time: kind to phone data
    setBusy(false);
    if (input.current) input.current.value = "";
    if (canSeeFiles(mode)) startTransition(() => router.refresh());
  }

  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;

  return (
    <div className="sf-wrap">
      <section className="panel-card sf-head">
        <span className="app-icon cyan"><FolderOpen size={20} aria-hidden="true" /></span>
        <div>
          <h1>{label || spaceName}</h1>
          <p>{workspaceName ? `Shared by ${workspaceName}` : "Shared folder"} · {SHARE_MODE_INFO[mode].label}{expiry ? ` · until ${expiry}` : ""}</p>
        </div>
      </section>

      {canUpload(mode) && (
        <section className="panel-card sf-upload" aria-labelledby="sf-up-h">
          <h2 id="sf-up-h">{mode === "collect" ? "Hand in your files" : "Add files"}</h2>
          <p className="field-hint">{mode === "collect" ? "Only the folder's owners will see what you send." : "Everyone with this link will see what you add."} PDF, Word, Excel, PowerPoint, images and more, up to 25 MB each.</p>
          <div className="field">
            <label htmlFor="sf-name">Your name</label>
            <input id="sf-name" className="text-input" maxLength={GUEST_NAME_MAX} autoComplete="name" value={guest}
              placeholder="e.g. Riya Sharma, Class 10-B" onChange={(e: { target: { value: string } }) => setGuest(e.target.value)} />
          </div>
          <input ref={input} id="sf-files" type="file" multiple className="visually-hidden" accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(e: { target: { files: FileList | null } }) => void send(e.target.files)} disabled={busy} />
          <label htmlFor="sf-files" className={`primary-button wide sf-pick${busy ? " disabled" : ""}`} aria-disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />} {busy ? "Sending…" : "Choose files to send"}
          </label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          {sent.length > 0 && (
            <ul className="sf-sent" aria-live="polite">
              {sent.map((s) => (
                <li key={s.key} className={s.status}>
                  {s.status === "uploading" ? <Loader2 size={15} className="spin" aria-hidden="true" /> : s.status === "done" ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}
                  <span className="sf-sent-name">{s.name}</span>
                  <span className="sf-sent-note">{s.status === "uploading" ? "Sending…" : s.status === "done" ? "Sent" : s.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canSeeFiles(mode) && (
        <section className="panel-card sf-files" aria-labelledby="sf-files-h">
          <h2 id="sf-files-h">Files <span className="sf-count">{total}</span></h2>
          {files.length === 0 ? (
            <p className="dash-empty">This folder is empty for now.</p>
          ) : (
            <ul className="file-list">
              {files.map((f) => (
                <li key={f.id} className="file-row">
                  <span className="file-icon">{f.mime.startsWith("image/") ? <ImageIcon size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}</span>
                  <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.size)} · {dateOf(f.createdAt)}</span></span>
                  <a className="secondary-button with-icon" href={`/api/shared/${token}/download/${f.id}`} rel="noreferrer"><Download size={15} aria-hidden="true" /> Download</a>
                </li>
              ))}
            </ul>
          )}
          {total > files.length && <p className="field-hint">Showing the newest {files.length} of {total}.</p>}
        </section>
      )}

      <p className="sf-foot">Shared privately with GeniusAI Workspace. Anyone with this link can use it, so share it only with the people it&apos;s meant for.</p>
    </div>
  );
}
