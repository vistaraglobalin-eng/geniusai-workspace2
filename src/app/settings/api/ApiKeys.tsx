"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Plus } from "lucide-react";
import { KEY_NAME_MAX } from "@/lib/api/keys";

type KeyRow = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null; usage: { requests: number; credits: number } };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function ApiKeys() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/api-keys");
        const d = (await res.json().catch(() => ({}))) as { keys?: KeyRow[]; message?: string };
        if (res.ok) setKeys(d.keys ?? []); else { setKeys([]); setError(d.message ?? "Keys couldn't be loaded."); }
      } catch { setKeys([]); setError("The connection dropped. Please refresh."); }
    })();
  }, []);

  async function create() {
    setBusy(true); setError(null); setFresh(null); setCopied(false);
    try {
      const res = await fetch("/api/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const d = (await res.json().catch(() => ({}))) as { key?: string; record?: KeyRow; message?: string };
      if (!res.ok || !d.key || !d.record) { setError(d.message ?? "The key couldn't be created."); return; }
      setFresh({ key: d.key, name: d.record.name });
      setKeys((list) => [d.record!, ...(list ?? [])]);
      setName("");
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(false); }
  }

  async function revoke(k: KeyRow) {
    if (!window.confirm(`Revoke "${k.name}"? Apps using it stop working at once.`)) return;
    const res = await fetch(`/api/api-keys/${k.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setKeys((list) => (list ?? []).map((x) => (x.id === k.id ? { ...x, revoked_at: new Date().toISOString() } : x)));
    else setError("The key couldn't be revoked. Please try again.");
  }

  async function copy() {
    if (!fresh) return;
    try { await navigator.clipboard.writeText(fresh.key); setCopied(true); } catch { /* the key is still shown to copy by hand */ }
  }

  const active = (keys ?? []).filter((k) => !k.revoked_at);
  const revoked = (keys ?? []).filter((k) => k.revoked_at);

  return (
    <div className="ak-wrap">
      <section className="panel-card ak-card">
        <h2><KeyRound size={17} aria-hidden="true" /> Create an API key</h2>
        <div className="ak-create">
          <input className="text-input" maxLength={KEY_NAME_MAX} value={name} placeholder="Name, e.g. School website or CRM" aria-label="Key name"
            onChange={(e: { target: { value: string } }) => setName(e.target.value)} />
          <button type="button" className="primary-button with-icon" onClick={create} disabled={busy || !name.trim()}><Plus size={15} aria-hidden="true" /> {busy ? "Creating…" : "Create key"}</button>
        </div>
        {fresh && (
          <div className="ak-fresh" role="status">
            <p><AlertTriangle size={15} aria-hidden="true" /> <strong>Copy this key now.</strong> For your security it won&apos;t be shown again.</p>
            <code>{fresh.key}</code>
            <button type="button" className="secondary-button with-icon" onClick={copy}>{copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? "Copied" : "Copy key"}</button>
            <p className="field-hint">Keep it on your server, never in a website&apos;s or app&apos;s code that users can see. Anyone with the key can spend this workspace&apos;s credits.</p>
          </div>
        )}
        {error && <p className="form-message error" role="alert">{error}</p>}
      </section>

      <section className="panel-card ak-card">
        <h2>Your keys</h2>
        {keys === null ? <p className="field-hint">Loading…</p> : active.length === 0 ? <p className="field-hint">No active keys.</p> : (
          <ul className="ak-list">
            {active.map((k) => (
              <li key={k.id}>
                <span className="ak-meta">
                  <strong>{k.name}</strong>
                  <span><code>{k.prefix}…</code> · created {day(k.created_at)} · {k.last_used_at ? `last used ${day(k.last_used_at)}` : "not used yet"}</span>
                  <span>Last 30 days: {k.usage.requests} request{k.usage.requests === 1 ? "" : "s"} · {k.usage.credits} credits</span>
                </span>
                <button type="button" className="quiet-button danger-text" onClick={() => revoke(k)}>Revoke</button>
              </li>
            ))}
          </ul>
        )}
        {revoked.length > 0 && <p className="field-hint">{revoked.length} revoked key{revoked.length === 1 ? "" : "s"}.</p>}
        <p className="field-hint">Each key allows 20 requests a minute. <Link href="/developers">See the endpoints and examples</Link>.</p>
      </section>
    </div>
  );
}
