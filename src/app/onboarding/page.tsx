import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { OnboardingForm } from "./OnboardingForm";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findDomainOffer, type DomainOffer } from "@/lib/team/domains-server";
import { DomainJoinCard } from "@/components/DomainJoinCard";

export const metadata: Metadata = { title: "Set up your workspace · GeniusAI Workspace" };

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login");
  if (ctx.workspace) redirect("/");
  // Company email: offer to join the company's workspace instead of making a new one.
  let offer: DomainOffer | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) offer = await findDomainOffer(createSupabaseAdminClient(), user);
  } catch { offer = null; }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark"><Sparkles size={20} /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </div>
        {offer && (
          <>
            <DomainJoinCard workspaceName={offer.workspaceName} domain={offer.domain} access={offer.access} />
            <div className="auth-divider"><span>or set up your own</span></div>
          </>
        )}
        <h1 className="auth-title">Set up your workspace</h1>
        <p className="auth-subtitle">This takes a few seconds.</p>
        <OnboardingForm defaultName={ctx.displayName ?? ""} defaultCurrency="INR" />
      </section>
    </main>
  );
}
