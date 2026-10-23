import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password · GeniusAI Workspace" };

/** Reached from the "reset your password" email (via /auth/callback, which signs the person in). */
export default async function ResetPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=link");
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </div>
        <h1 className="auth-title">Choose a new password</h1>
        <p className="auth-subtitle">For {user.email}. You&apos;ll use it to sign in from now on.</p>
        <ResetForm />
      </section>
    </main>
  );
}
