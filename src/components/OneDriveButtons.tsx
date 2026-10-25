"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Cloud, FileText, Folder, Search, X } from "lucide-react";
import { mimeFromName } from "@/lib/integrations/mime";

type Item = { id: string; name: string; folder: boolean; size: number; modified: string };
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** OneDrive file browser in a sheet: open folders, search, tick up to 10 files and bring them into Files. */
function Browser({ onClose, onDone }: { onClose: () => void; onDone: (ids: string[]) => void }) {
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "OneDrive" }]);
  const [q, setQ] = useState(""), [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Item[]>([]);
  const here = trail[trail.length - 1];

  useEffect(() => {
    let cancelled = false;
    setItems(null); setError(null);
    const p = new URLSearchParams(query ? { q: query } : here.id ? { folder: here.id } : {});
    fetch(`/api/integrations/onedrive/list?${p}`).then(async (r) => {
      const d = (await r.json().catch(() => ({}))) as { items?: Item[]; message?: string };
      if (cancelled) return;
      if (!r.ok) setError(d.message ?? "OneDrive couldn't be opened."); else setItems(d.items ?? []);
    }).catch(() => { if (!cancelled) setError("The connection dropped. Please try again."); });
    return () => { cancelled = true; };
  }, [here.id, query]);

  const toggle = (it: Item) => setPicked((p) => (p.some((x) => x.id === it.id) ? p.filter((x) => x.id !== it.id) : p.length >= 10 ? p : [...p, it]));
  return (
    <div className="od-backdrop" role="dialog" aria-modal="true" aria-label="Choose files from OneDrive" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="od-sheet">
        <div className="od-head">
          <strong><Cloud size={17} aria-hidden="true" /> OneDrive</strong>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
        <form className="od-search input-with-icon" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <Search size={16} aria-hidden="true" />
          <input className="text-input" type="search" placeholder="Search your OneDrive" value={q} maxLength={100} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setQuery(""); }} aria-label="Search your OneDrive" />
        </form>
        <div className="od-trail">
          {query ? <span>Results for “{query}”</span> : trail.length > 1 ? (
            <button type="button" className="quiet-button with-icon" onClick={() => setTrail((t) => t.slice(0, -1))}><ChevronLeft size={15} aria-hidden="true" /> {trail[trail.length - 2].name}</button>
          ) : null}
          {!query && <strong>{here.name}</strong>}
        </div>
        <ul className="od-list">
          {error && <li className="form-message error">{error}</li>}
          {!error && !items && <li><span className="skeleton od-skel" /></li>}
          {items?.length === 0 && <li className="lt-help od-empty">Nothing here.</li>}
          {items?.map((it) => {
            const ok = it.folder || (!!mimeFromName(it.name) && it.size <= 25 * 1048576);
            const on = picked.some((p) => p.id === it.id);
            return (
              <li key={it.id}>
                <button type="button" className={`od-item${on ? " on" : ""}`} disabled={!ok}
                  onClick={() => (it.folder ? (setTrail((t) => [...t, { id: it.id, name: it.name }]), setQuery(""), setQ("")) : toggle(it))}>
                  <span className="od-icon">{it.folder ? <Folder size={17} aria-hidden="true" /> : on ? <Check size={17} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}</span>
                  <span className="od-name"><span>{it.name}</span><small>{it.folder ? "Folder" : ok ? sizeOf(it.size) : it.size > 25 * 1048576 ? "Over 25 MB" : "Type not supported"}</small></span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="od-foot">
          <span className="lt-help">{picked.length ? `${picked.length} selected` : "Tap files to select (up to 10)"}</span>
          <button type="button" className="primary-button" disabled={!picked.length} onClick={() => onDone(picked.map((p) => p.id))}>Add to Files</button>
        </div>
      </div>
    </div>
  );
}

export function OneDriveImportButton({ spaceId = null }: { spaceId?: string | null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function bringIn(ids: string[]) {
    setOpen(false); setBusy(`Bringing in ${ids.length} file${ids.length === 1 ? "" : "s"}…`); setMsg(null);
    const r = await fetch("/api/integrations/onedrive/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { added?: { id: string }[]; problems?: string[]; message?: string }) : {};
    const added = d.added ?? [];
    if (spaceId && added.length) await fetch("/api/files/move", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds: added.map((a) => a.id), spaceId }) }).catch(() => null);
    setMsg(added.length ? { ok: !d.problems?.length, text: `Added ${added.length} file${added.length === 1 ? "" : "s"} from OneDrive.${d.problems?.length ? ` ${d.problems.join(" · ")}` : ""}` }
      : { ok: false, text: d.message ?? d.problems?.join(" · ") ?? "Nothing was added." });
    setBusy(null); startTransition(() => router.refresh());
  }
  return (
    <span className="drive-btn-wrap">
      <button type="button" className="secondary-button with-icon" onClick={() => { setMsg(null); setOpen(true); }} disabled={!!busy}><Cloud size={16} aria-hidden="true" /> {busy ?? "From OneDrive"}</button>
      {msg && <span className={`form-message ${msg.ok ? "success" : "error"}`} role="status">{msg.text}</span>}
      {open && <Browser onClose={() => setOpen(false)} onDone={bringIn} />}
    </span>
  );
}

export function OneDriveSaveButton({ fileId }: { fileId: string }) {
  const [state, setState] = useState<{ busy?: boolean; link?: string | null; error?: string } | null>(null);
  async function save() {
    setState({ busy: true });
    const r = await fetch("/api/integrations/onedrive/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId }) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as { link?: string | null; message?: string }) : {};
    setState(r?.ok ? { link: d.link ?? null } : { error: d.message ?? "It couldn't be saved to OneDrive." });
  }
  const done = state && !state.busy && !state.error;
  return (
    <span className="drive-btn-wrap">
      {done ? (
        <a className="secondary-button with-icon" href={state.link ?? "https://onedrive.live.com"} target="_blank" rel="noopener noreferrer"><Check size={15} aria-hidden="true" /> Saved — open in OneDrive</a>
      ) : (
        <button type="button" className="secondary-button with-icon" onClick={save} disabled={state?.busy}><Cloud size={15} aria-hidden="true" /> {state?.busy ? "Saving…" : "Save to OneDrive"}</button>
      )}
      {state?.error && <span className="form-message error" role="alert">{state.error}</span>}
    </span>
  );
}
