import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { CardStudio } from "./CardStudio";

export const metadata: Metadata = { title: "Visiting cards & letterhead · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/cards");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings } = await loadInvoiceData(supabase, workspace.id);
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="letters" breadcrumb="Visiting cards & letterhead">
      <div className="welcome-row">
        <div>
          <h1>Visiting cards & letterhead</h1>
          <p className="subtitle">Design a visiting card with a QR code, print it at home or at a print shop, share it on WhatsApp, and get a matching letterhead. Free.</p>
        </div>
      </div>
      <CardStudio workspaceId={workspace.id} settings={settings} displayName={ctx.displayName} initialTab={tab === "letterhead" ? "letterhead" : "card"} />
    </AppShell>
  );
}
