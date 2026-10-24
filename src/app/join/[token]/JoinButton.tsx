"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export function JoinButton({ token, needName, label }: { token: string; needName: boolean; label: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    if (needName && name.trim().length < 2) { setError("Enter your name so your team knows who you are."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/team/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, name }) });
      const j = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) { setError(j.message ?? "You couldn't be added. Please try again."); setBusy(false); return; }
      window.location.href = "/";
    } catch { setError("Check your internet connection and try again."); setBusy(false); }
  }
  return (
    <div className="join-form">
      {needName && <label className="field">Your name<input className="text-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" /></label>}
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button type="button" className="primary-button wide" onClick={join} disabled={busy}><Check size={16} aria-hidden="true" /> {busy ? "Joining…" : label}</button>
    </div>
  );
}
