"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HardDrive } from "lucide-react";

type PickerDoc = { id: string };
type Win = Window & { gapi?: { load: (n: string, cb: () => void) => void }; google?: { picker: Record<string, any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any

function loadPicker(): Promise<void> {
  const w = window as Win;
  if (w.google?.picker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const go = () => w.gapi!.load("picker", () => resolve());
    if (w.gapi) return go();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js"; s.async = true; s.onload = go; s.onerror = () => reject(new Error("load"));
    document.head.appendChild(s);
  });
}

/** "From Google Drive": opens Google's file picker and copies the chosen files into Files. */
export function DriveImportButton({ spaceId = null }: { spaceId?: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function open() {
    setMsg(null); setBusy("Opening Drive…");
    try {
      const res = await fetch("/api/integrations/google/token");
      const t = (await res.json().catch(() => ({}))) as { token?: string; apiKey?: string; appId?: string; message?: string };
      if (!res.ok || !t.token) { setMsg({ ok: false, text: t.message ?? "Google Drive isn't available right now." }); setBusy(null); return; }
      await loadPicker();
      const g = (window as Win).google!.picker;
      const view = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false)
        .setMimeTypes("application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation");
      const picker = new g.PickerBuilder()
        .addView(view).enableFeature(g.Feature.MULTISELECT_ENABLED).setMaxItems(10)
        .setOAuthToken(t.token).setDeveloperKey(t.apiKey).setAppId(t.appId).setOrigin(window.location.origin).setTitle("Choose files to bring into GeniusAI")
        .setCallback(async (data: { action: string; docs?: PickerDoc[] }) => {
          if (data.action !== g.Action.PICKED || !data.docs?.length) { if (data.action === g.Action.CANCEL) setBusy(null); return; }
          setBusy(`Bringing in ${data.docs.length} file${data.docs.length === 1 ? "" : "s"}…`);
          const r = await fetch("/api/integrations/google/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: data.docs.map((d) => d.id) }) }).catch(() => null);
          const d = r ? ((await r.json().catch(() => ({}))) as { added?: { id: string; name: string }[]; problems?: string[]; message?: string }) : {};
          const added = d.added ?? [];
          if (spaceId && added.length) await fetch("/api/files/move", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: added.map((a) => a.id), spaceId }) }).catch(() => null);
          setMsg(added.length ? { ok: !d.problems?.length, text: `Added ${added.length} file${added.length === 1 ? "" : "s"} from Drive.${d.problems?.length ? ` ${d.problems.join(" · ")}` : ""}` }
            : { ok: false, text: d.message ?? d.problems?.join(" · ") ?? "Nothing was added." });
          setBusy(null); startTransition(() => router.refresh());
        }).build();
      picker.setVisible(true);
      setBusy(null);
    } catch { setMsg({ ok: false, text: "Google Drive couldn't be opened. Check your connection and try again." }); setBusy(null); }
  }

  return (
    <span className="drive-btn-wrap">
      <button type="button" className="secondary-button with-icon" onClick={open} disabled={!!busy}><HardDrive size={16} aria-hidden="true" /> {busy ?? "From Google Drive"}</button>
      {msg && <span className={`form-message ${msg.ok ? "success" : "error"}`} role="status">{msg.text}</span>}
    </span>
  );
}

/** "Save to Drive" for one file. */
export function DriveSaveButton({ fileId }: { fileId: string }) {
  const [state, setState] = useState<{ busy?: boolean; link?: string | null; error?: string } | null>(null);
  async function save() {
    setState({ busy: true });
    const r = await fetch("/api/integrations/google/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { link?: string | null; message?: string }) : {};
    setState(r?.ok ? { link: d.link ?? null } : { error: d.message ?? "It couldn't be saved to Drive." });
  }
  return (
    <span className="drive-btn-wrap">
      {state?.link !== undefined && !state.error && !state.busy ? (
        <a className="secondary-button with-icon" href={state.link ?? "https://drive.google.com"} target="_blank" rel="noopener noreferrer"><Check size={15} aria-hidden="true" /> Saved — open in Drive</a>
      ) : (
        <button type="button" className="secondary-button with-icon" onClick={save} disabled={state?.busy}><HardDrive size={15} aria-hidden="true" /> {state?.busy ? "Saving…" : "Save to Drive"}</button>
      )}
      {state?.error && <span className="form-message error" role="alert">{state.error}{/connect/i.test(state.error) ? <> <Link href="/settings/apps">Connected apps</Link></> : null}</span>}
    </span>
  );
}
