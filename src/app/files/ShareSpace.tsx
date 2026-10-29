"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Plus, Send, Share2, X } from "lucide-react";
import { SHARE_EXPIRY_DAYS, SHARE_LABEL_MAX, SHARE_MODES, SHARE_MODE_INFO, sharePath, type ShareMode, type ShareRow } from "@/lib/shares";
import { track } from "@/lib/analytics";

type Share = ShareRow & { block: "revoked" | "expired" | null };
const EXPIRY_LABEL: Record<number, string> = { 1: "1 day", 7: "7 days", 30: "30 days", 0: "No end date" };

/** Share a space outside the workspace: private links that show files, take files, or both. */
export function ShareSpace({ spaceId, spaceName, onClose }: { spaceId: string; spaceName: string; onClose: () => void }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [mode, setMode] = useState<ShareMode>("view");
  const [days, setDays] = useState<number>(7);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/spaces/${spaceId}/shares`);
        const d = (await res.json().catch(() => ({}))) as { shares?: Share[]; message?: string };
        if (!alive) return;
        if (res.ok) setShares(d.shares ?? []); else { setShares([]); setError(d.message ?? "Links couldn't be loaded."); }
      } catch { if (alive) { setShares([]); setError("The connection dropped. Please try again."); } }
    })();
    return () => { alive = false; };
  }, [spaceId]);

  const urlOf = (s: Share) => `${window.location.origin}${sharePath(s.token)}`;

  async function create() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/shares`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, days, label }) });
      const d = (await res.json().catch(() => ({}))) as { share?: Share; message?: string };
      if (!res.ok || !d.share) { setError(d.message ?? "The link couldn't be created."); return; }
      setShares((list) => [d.share!, ...(list ?? [])]);
      setLabel("");
      track("space_shared", { mode, days });
      await copy(d.share);
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(false); }
  }

  async function copy(s: Share) {
    try { await navigator.clipboard.writeText(urlOf(s)); setCopied(s.id); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard blocked: the link is still shown */ }
  }

  async function shareOut(s: Share) {
    const text = `${s.label || spaceName}: ${SHARE_MODE_INFO[s.mode].label}`;
    if (navigator.share) { try { await navigator.share({ title: s.label || spaceName, text, url: urlOf(s) }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${urlOf(s)}`)}`, "_blank", "noopener");
  }

  async function revoke(s: Share) {
    if (!window.confirm("Turn off this link? It stops working at once. Files already received stay in the space.")) return;
    const res = await fetch(`/api/spaces/${spaceId}/shares/${s.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setShares((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, revoked_at: new Date().toISOString(), block: "revoked" } : x)));
    else setError("The link couldn't be turned off. Please try again.");
  }

  const active = (shares ?? []).filter((s) => !s.block);
  const old = (shares ?? []).filter((s) => s.block);

  return (
    <section className="panel-card ss-panel" aria-labelledby="ss-h">
      <div className="ss-top">
        <h3 id="ss-h"><Share2 size={16} aria-hidden="true" /> Share “{spaceName}” outside the workspace</h3>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </div>
      <p className="field-hint">Anyone with a link can use it without an account: clients, students, a class or another team. Turn a link off any time.</p>

      <div className="ss-form">
        <fieldset className="ss-modes">
          <legend>People with the link can</legend>
          {SHARE_MODES.map((m) => (
            <label key={m} className={`ss-mode${mode === m ? " on" : ""}`}>
              <input type="radio" name="ss-mode" checked={mode === m} onChange={() => setMode(m)} />
              <strong>{SHARE_MODE_INFO[m].label}</strong><span>{SHARE_MODE_INFO[m].text}</span>
            </label>
          ))}
        </fieldset>
        <div className="ss-row">
          <label className="field"><span>Works for</span>
            <select className="text-input" value={days} onChange={(e: { target: { value: string } }) => setDays(Number(e.target.value))}>
              {SHARE_EXPIRY_DAYS.map((d) => <option key={d} value={d}>{EXPIRY_LABEL[d]}</option>)}
            </select>
          </label>
          <label className="field"><span>Name <span className="optional">(optional)</span></span>
            <input className="text-input" maxLength={SHARE_LABEL_MAX} value={label} placeholder="e.g. Class 10-B homework" onChange={(e: { target: { value: string } }) => setLabel(e.target.value)} />
          </label>
        </div>
        <button type="button" className="primary-button with-icon" onClick={create} disabled={busy}><Plus size={15} aria-hidden="true" /> {busy ? "Creating…" : "Create link"}</button>
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}

      {shares === null ? <p className="field-hint">Loading links…</p> : (
        <>
          {active.length > 0 && (
            <ul className="ss-list" aria-label="Active links">
              {active.map((s) => (
                <li key={s.id}>
                  <span className="ss-icon"><Link2 size={16} aria-hidden="true" /></span>
                  <span className="ss-meta">
                    <strong>{s.label || SHARE_MODE_INFO[s.mode].label}</strong>
                    <span>{s.label ? `${SHARE_MODE_INFO[s.mode].label} · ` : ""}{s.expires_at ? `until ${new Date(s.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "no end date"} · opened {s.view_count}×{s.mode !== "view" ? ` · ${s.upload_count} file${s.upload_count === 1 ? "" : "s"} received` : ""}</span>
                  </span>
                  <span className="ss-actions">
                    <button type="button" className="quiet-button with-icon" onClick={() => copy(s)}>{copied === s.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied === s.id ? "Copied" : "Copy"}</button>
                    <button type="button" className="quiet-button with-icon" onClick={() => shareOut(s)}><Send size={14} aria-hidden="true" /> Send</button>
                    <button type="button" className="quiet-button danger-text" onClick={() => revoke(s)}>Turn off</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {active.length === 0 && <p className="field-hint">No active links yet.</p>}
          {old.length > 0 && <p className="field-hint">{old.length} older link{old.length === 1 ? " is" : "s are"} off or expired.</p>}
        </>
      )}
    </section>
  );
}
