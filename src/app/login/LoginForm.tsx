"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Three ways in:
//   * Continue with Google: no email needed, no limits (shown when NEXT_PUBLIC_GOOGLE_SIGNIN=on).
//   * Email + password: sign in any time without waiting for an email.
//   * Email link: passwordless; depends on the email service's sending limits.

type Mode = "signin" | "signup" | "link" | "forgot";
type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done"; message: string } | { kind: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";

function friendly(message: string, status?: number): string {
  if (status === 429 || /rate limit|too many/i.test(message)) return "Too many emails were requested. Please wait a while, or sign in with your password or Google instead.";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again, or use “Forgot password?”.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first: open the link we sent when you created your account.";
  if (/already registered|already exists/i.test(message)) return "There's already an account with this email. Sign in instead, or use “Forgot password?”.";
  if (/password/i.test(message) && /(weak|short|least|characters)/i.test(message)) return "Choose a stronger password: at least 8 characters, with letters and numbers.";
  if (/provider is not enabled|unsupported provider/i.test(message)) return "Google sign-in isn't switched on yet. Use email and password for now.";
  return "Something went wrong. Please try again.";
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function callbackUrl(target = next) {
    const url = new URL("/auth/callback", window.location.origin);
    if (target !== "/") url.searchParams.set("next", target);
    return url.toString();
  }

  function switchMode(m: Mode) { setMode(m); setStatus({ kind: "idle" }); }

  async function google() {
    setStatus({ kind: "busy" });
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(), queryParams: { prompt: "select_account" } }
    });
    if (error) setStatus({ kind: "error", message: friendly(error.message, error.status) });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) { setStatus({ kind: "error", message: "Please enter a valid email address." }); return; }
    if ((mode === "signin" || mode === "signup") && !password) { setStatus({ kind: "error", message: "Enter your password." }); return; }
    if (mode === "signup" && (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password))) {
      setStatus({ kind: "error", message: "Choose a password with at least 8 characters, including letters and numbers." });
      return;
    }
    setStatus({ kind: "busy" });
    const auth = createSupabaseBrowserClient().auth;

    if (mode === "signin") {
      const { error } = await auth.signInWithPassword({ email: address, password });
      if (error) { setStatus({ kind: "error", message: friendly(error.message, error.status) }); return; }
      router.replace(next);
      router.refresh();
      return;
    }
    if (mode === "signup") {
      const { data, error } = await auth.signUp({ email: address, password, options: { emailRedirectTo: callbackUrl() } });
      if (error) { setStatus({ kind: "error", message: friendly(error.message, error.status) }); return; }
      if (data.session) { router.replace(next); router.refresh(); return; }
      // Supabase hides whether an address is already registered: an empty identities list means it is.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setStatus({ kind: "error", message: friendly("already registered") });
        return;
      }
      setStatus({ kind: "done", message: `Almost there: we sent a confirmation link to ${address}. Open it once to activate your account; after that you can sign in with your password any time.` });
      return;
    }
    if (mode === "forgot") {
      const { error } = await auth.resetPasswordForEmail(address, { redirectTo: callbackUrl("/auth/reset") });
      if (error) { setStatus({ kind: "error", message: friendly(error.message, error.status) }); return; }
      setStatus({ kind: "done", message: `If there's an account for ${address}, we've sent a link to choose a new password. Open it in this browser.` });
      return;
    }
    const { error } = await auth.signInWithOtp({ email: address, options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true } });
    if (error) { setStatus({ kind: "error", message: friendly(error.message, error.status) }); return; }
    setStatus({ kind: "done", message: `Check your inbox: we sent a sign-in link to ${address}. Open it in this browser to continue.` });
  }

  if (status.kind === "done") {
    return (
      <div className="form-message success" role="status">
        {status.message}
        <button type="button" className="link-button" onClick={() => switchMode("signin")}>Back to sign in</button>
      </div>
    );
  }

  const busy = status.kind === "busy";
  const title = { signin: "Sign in", signup: "Create your account", link: "Email me a sign-in link", forgot: "Reset your password" }[mode];

  return (
    <div className="auth-methods">
      {GOOGLE_ENABLED && (mode === "signin" || mode === "signup") && (
        <>
          <button type="button" className="google-button" onClick={google} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </button>
          <div className="auth-divider"><span>or with email</span></div>
        </>
      )}

      <form className="auth-form" onSubmit={onSubmit} noValidate aria-label={title}>
        {mode !== "signin" && <p className="auth-mode-title">{title}</p>}
        <label htmlFor="email">Email address</label>
        <div className="input-with-icon">
          <Mail size={16} aria-hidden="true" />
          <input id="email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@company.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        {(mode === "signin" || mode === "signup") && (
          <>
            <div className="auth-label-row">
              <label htmlFor="password">{mode === "signup" ? "Choose a password" : "Password"}</label>
              {mode === "signin" && <button type="button" className="link-button" onClick={() => switchMode("forgot")}>Forgot password?</button>}
            </div>
            <div className="input-with-icon input-with-action">
              <Lock size={16} aria-hidden="true" />
              <input id="password" name="password" type={show ? "text" : "password"} required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 8 characters, letters and numbers" : "Your password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="icon-button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </>
        )}

        {status.kind === "error" && <p className="form-message error" role="alert">{status.message}</p>}
        <button className="primary-button wide" type="submit" disabled={busy}>
          {busy ? "Please wait…" : <>{{ signin: "Sign in", signup: "Create account", link: "Email me a link", forgot: "Send reset link" }[mode]} <ArrowRight size={16} aria-hidden="true" /></>}
        </button>
      </form>

      <div className="auth-switches">
        {mode === "signin" && <p>New to GeniusAI? <button type="button" className="link-button" onClick={() => switchMode("signup")}>Create an account</button></p>}
        {mode === "signup" && <p>Already have an account? <button type="button" className="link-button" onClick={() => switchMode("signin")}>Sign in</button></p>}
        {(mode === "link" || mode === "forgot") && <p><button type="button" className="link-button" onClick={() => switchMode("signin")}>Back to sign in with password</button></p>}
        {(mode === "signin" || mode === "signup") && (
          <p><button type="button" className="link-button with-icon" onClick={() => switchMode("link")}><KeyRound size={14} aria-hidden="true" /> Sign in without a password (email link)</button></p>
        )}
      </div>
    </div>
  );
}
