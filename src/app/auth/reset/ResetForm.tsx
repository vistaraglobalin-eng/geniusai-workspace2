"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) { setError("Use at least 8 characters, including letters and numbers."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true); setError(null);
    const { error: err } = await createSupabaseBrowserClient().auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(/same/i.test(err.message) ? "Choose a password you haven't used before." : "The password couldn't be changed. Please request a new reset link."); return; }
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="new-password">New password</label>
      <div className="input-with-icon"><Lock size={16} aria-hidden="true" />
        <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <label htmlFor="confirm-password">Type it again</label>
      <div className="input-with-icon"><Lock size={16} aria-hidden="true" />
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="primary-button wide" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
