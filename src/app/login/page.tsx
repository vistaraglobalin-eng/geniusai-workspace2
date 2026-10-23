import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLinks } from "@/components/PublicLayout";
import { Sparkles, ShieldCheck } from "lucide-react";
import { LoginForm } from "./LoginForm";
import { safeNextPath } from "@/lib/auth/paths";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { SetupNotice } from "@/components/SetupNotice";

export const metadata: Metadata = { title: "Sign in · GeniusAI Workspace" };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; signedout?: string }>;
}) {
  if (!getSupabasePublicEnv().configured) return <SetupNotice />;

  const params = await searchParams;
  const next = safeNextPath(params.next);
  const linkError = params.error === "link";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </div>
        <h1 className="auth-title">Sign in</h1>
        <p className="auth-subtitle">We&apos;ll email you a secure link. No password needed. New here? The same link creates your account.</p>
        {params.signedout === "all" && (
          <p className="form-message success" role="status">You&apos;ve been signed out on all devices.</p>
        )}
        {linkError && (
          <p className="form-message error" role="alert">
            That sign-in link didn&apos;t work. Links expire after an hour and must be opened in the same browser you requested them from. Please request a new one.
          </p>
        )}
        <LoginForm next={next} />
        <p className="consent-note">
          By continuing, you agree to our <Link href="/terms">Terms</Link> and confirm you&apos;ve read our <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <div className="auth-foot"><ShieldCheck size={15} /> Your files stay private to your workspace.</div>
        <PolicyLinks className="policy-links auth-links" />
      </section>
    </main>
  );
}
