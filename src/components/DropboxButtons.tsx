"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Box, Check } from "lucide-react";
import { PICKER_EXTENSIONS } from "@/lib/integrations/mime";

type DbxFile = { link: string; name: string; bytes: number };
type DbxApi = {
  choose: (o: { success: (files: DbxFile[]) => void; cancel?: () => void; linkType: "direct"; multiselect: boolean; extensions: string[]; sizeLimit: number; folderselect: boolean }) => void;
  save: (o: { files: { url: string; filename: string }[]; success: () => void; error: (msg: string) => void; cancel?: () => void }) => void;
};

function loadDropins(appKey: string): Promise<DbxApi> {
  const w = window as Window & { Dropbox?: DbxApi };
  if (w.Dropbox) return Promise.resolve(w.Dropbox);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://www.dropbox.com/static/api/2/dropins.js"; s.id = "dropboxjs"; s.dataset.appKey = appKey; s.async = true;
    s.onload = () => (w.Dropbox ? resolve(w.Dropbox) : reject(new Error("load")));
    s.onerror = () => reject(new Error("load"));
    document.head.appendChild(s);
  });
}

/** "From Dropbox": Dropbox's own file chooser; the chosen files are copied into Files. */
export function DropboxImportButton({ appKey, spaceId = null }: { appKey: string; spaceId?: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function open() {
    setMsg(null);
    try {
      const dbx = await loadDropins(appKey);
      dbx.choose({
        linkType: "direct", multiselect: true, folderselect: false, extensions: PICKER_EXTENSIONS, sizeLimit: 25 * 1024 * 1024,
        success: async (files) => {
          setBusy(`Bringing in ${files.length} file${files.length === 1 ? "" : "s"}…`);
          const r = await fetch("/api/integrations/dropbox/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: files.slice(0, 10).map((f) => ({ link: f.link, name: f.name })) }) }).catch(() => null);
          const d = r ? ((await r.json().catch(() => ({}))) as { added?: { id: string }[]; problems?: string[]; message?: string }) : {};
          const added = d.added ?? [];
          if (spaceId && added.length) await fetch("/api/files/move", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: added.map((a) => a.id), spaceId }) }).catch(() => null);
          setMsg(added.length ? { ok: !d.problems?.length, text: `Added ${added.length} file${added.length === 1 ? "" : "s"} from Dropbox.${d.problems?.length ? ` ${d.problems.join(" · ")}` : ""}` }
            : { ok: false, text: d.message ?? d.problems?.join(" · ") ?? "Nothing was added." });
          setBusy(null); startTransition(() => router.refresh());
        },
        cancel: () => setBusy(null)
      });
    } catch { setMsg({ ok: false, text: "Dropbox couldn't be opened. Allow pop-ups for this site and try again." }); }
  }
  return (
    <span className="drive-btn-wrap">
      <button type="button" className="secondary-button with-icon" onClick={open} disabled={!!busy}><Box size={16} aria-hidden="true" /> {busy ?? "From Dropbox"}</button>
      {msg && <span className={`form-message ${msg.ok ? "success" : "error"}`} role="status">{msg.text}</span>}
    </span>
  );
}

/** "Save to Dropbox": Dropbox Saver copies the file straight from a short-lived link. */
export function DropboxSaveButton({ appKey, fileId }: { appKey: string; fileId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  async function save() {
    setState("busy");
    try {
      const [dbx, r] = await Promise.all([loadDropins(appKey), fetch("/api/integrations/dropbox/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId }) })]);
      const d = (await r.json().catch(() => ({}))) as { url?: string; name?: string; message?: string };
      if (!r.ok || !d.url) { setState(d.message ?? "A link couldn't be made."); return; }
      dbx.save({ files: [{ url: d.url, filename: d.name ?? "file" }], success: () => setState("done"), error: (m) => setState(m || "Dropbox couldn't save it."), cancel: () => setState("idle") });
    } catch { setState("Dropbox couldn't be opened. Allow pop-ups for this site and try again."); }
  }
  return (
    <span className="drive-btn-wrap">
      <button type="button" className="secondary-button with-icon" onClick={save} disabled={state === "busy" || state === "done"}>
        {state === "done" ? <Check size={15} aria-hidden="true" /> : <Box size={15} aria-hidden="true" />} {state === "busy" ? "Opening Dropbox…" : state === "done" ? "Saved to Dropbox" : "Save to Dropbox"}
      </button>
      {state !== "idle" && state !== "busy" && state !== "done" && <span className="form-message error" role="alert">{state}</span>}
    </span>
  );
}
