"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";

/** "Your company is on GeniusAI": one-tap join for people whose confirmed email is on a claimed domain. */
export function DomainJoinCard({ workspaceName, domain, access, dismissible = false }: { workspaceName: string; domain: string; access: "edit" | "view"; dismissible?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const key = `gai_domain_offer_hidden:${domain}`;

  useEffect(() => { if (dismissible) { try { setHidden(localStorage.getItem(key) === "1"); } catch { /* private mode */ } } }, [dismissible, key]);
  if (hidden) return null;

  async function join() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/workspace/domain-join", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) { setError(d.message ?? "You couldn't be added. Please try again."); return; }
      router.push("/"); router.refresh();
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel-card dj-card" aria-labelledby="dj-h">
      <span className="app-icon indigo"><Building2 size={20} aria-hidden="true" /></span>
      <div className="dj-text">
        <h2 id="dj-h">{workspaceName} is on GeniusAI</h2>
        <p>Your @{domain} email lets you join your company&apos;s workspace{access === "view" ? " (view access; an admin can give you more)" : ""}.</p>
        {error && <p className="form-message error" role="alert">{error}</p>}
      </div>
      <div className="dj-actions">
        <button type="button" className="primary-button" onClick={join} disabled={busy}>{busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : null} Join {workspaceName}</button>
        {dismissible && <button type="button" className="quiet-button" onClick={() => { setHidden(true); try { localStorage.setItem(key, "1"); } catch { /* ignore */ } }}>Not now</button>}
      </div>
    </section>
  );
}
