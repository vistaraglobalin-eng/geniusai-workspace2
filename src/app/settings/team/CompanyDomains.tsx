"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Trash2 } from "lucide-react";

type DomainRow = { domain: string; access: "edit" | "view" };

/** Admins: let anyone with a company email join automatically. */
export function CompanyDomains({ domains, suggested, setupNeeded }: { domains: DomainRow[]; suggested: string; setupNeeded: boolean }) {
  const router = useRouter();
  const [domain, setDomain] = useState(domains.length ? "" : suggested);
  const [access, setAccess] = useState<"edit" | "view">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/team/domains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain, access }) });
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) { setError(d.message ?? "That couldn't be saved."); return; }
      setDomain(""); router.refresh();
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(false); }
  }
  async function remove(d: string) {
    if (!window.confirm(`Stop letting @${d} emails join automatically? People who already joined stay.`)) return;
    const res = await fetch(`/api/team/domains?domain=${encodeURIComponent(d)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) router.refresh(); else setError("That couldn't be removed. Please try again.");
  }

  return (
    <section className="panel-card cd-card" aria-labelledby="cd-h">
      <h2 id="cd-h"><AtSign size={17} aria-hidden="true" /> Join with company email</h2>
      <p className="field-hint">Anyone who signs in with a confirmed email on your company&apos;s domain can join this workspace in one tap, with the access you choose. Works with Google, Microsoft or email sign-in. Your own email must be on the domain; public providers like Gmail can&apos;t be used.</p>
      {setupNeeded ? <p className="form-message warning">Company email joining needs a one-time database update first.</p> : (
        <>
          {domains.length > 0 && (
            <ul className="cd-list">
              {domains.map((d) => (
                <li key={d.domain}>
                  <span><strong>@{d.domain}</strong><em>Joins as {d.access === "edit" ? "Editor" : "Viewer"}</em></span>
                  <button type="button" className="icon-button" aria-label={`Remove @${d.domain}`} onClick={() => remove(d.domain)}><Trash2 size={15} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="cd-form">
            <span className="cd-at" aria-hidden="true">@</span>
            <input className="text-input" value={domain} placeholder="yourcompany.com" aria-label="Company email domain" onChange={(e: { target: { value: string } }) => setDomain(e.target.value)} />
            <select className="text-input" value={access} aria-label="Access for people who join" onChange={(e: { target: { value: string } }) => setAccess(e.target.value === "edit" ? "edit" : "view")}>
              <option value="view">as Viewers</option>
              <option value="edit">as Editors</option>
            </select>
            <button type="button" className="primary-button" onClick={add} disabled={busy || !domain.trim()}>{busy ? "Saving…" : "Allow"}</button>
          </div>
          <p className="field-hint">Viewers can read files and ask policy questions; editors can also create and use credits. You can change anyone&apos;s role in the list above.</p>
        </>
      )}
      {error && <p className="form-message error" role="alert">{error}</p>}
    </section>
  );
}
