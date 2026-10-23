"use client";

import { useState, type FormEvent } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setStatus({ kind: "error", message: "Please enter a valid email address." });
      return;
    }
    setStatus({ kind: "sending" });

    const supabase = createSupabaseBrowserClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next !== "/") callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callback.toString(), shouldCreateUser: true }
    });

    if (error) {
      const rateLimited = error.status === 429 || /rate limit/i.test(error.message);
      setStatus({
        kind: "error",
        message: rateLimited
          ? "Too many sign-in emails were requested. Please wait a few minutes and try again."
          : "We couldn't send the sign-in email. Please check the address and try again."
      });
      return;
    }
    setStatus({ kind: "sent", email: address });
  }

  if (status.kind === "sent") {
    return (
      <div className="form-message success" role="status">
        <strong>Check your inbox.</strong> We sent a sign-in link to {status.email}. Open it in this browser to continue.
        <button type="button" className="link-button" onClick={() => setStatus({ kind: "idle" })}>Use a different email</button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="email">Email address</label>
      <div className="input-with-icon">
        <Mail size={16} aria-hidden="true" />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {status.kind === "error" && <p className="form-message error" role="alert">{status.message}</p>}
      <button className="primary-button wide" type="submit" disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "Sending link…" : <>Email me a sign-in link <ArrowRight size={16} /></>}
      </button>
    </form>
  );
}
