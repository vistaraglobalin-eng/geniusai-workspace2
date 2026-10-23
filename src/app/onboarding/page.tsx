import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Set up your workspace · GeniusAI Workspace" };

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login");
  if (ctx.workspace) redirect("/");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </div>
        <h1 className="auth-title">Set up your workspace</h1>
        <p className="auth-subtitle">This takes a few seconds.</p>
        <OnboardingForm defaultName={ctx.displayName ?? ""} defaultCurrency="INR" />
      </section>
    </main>
  );
}
