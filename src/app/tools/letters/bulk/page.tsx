import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { bulkTemplate } from "@/lib/letters/bulk";
import { BulkLetters } from "./BulkLetters";

export const metadata: Metadata = { title: "Bulk letters · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function BulkLettersPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/letters/bulk");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings } = await loadInvoiceData(supabase, workspace.id);
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="letters" breadcrumb="Bulk letters">
      <Link href="/tools/letters" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Business letters</Link>
      <div className="welcome-row">
        <div>
          <h1>Bulk <span>letters</span></h1>
          <p className="subtitle">Offer letters for a whole batch of hires, salary slips for everyone, experience letters and more: upload your Excel sheet and get one letter per person on your letterhead, ready to download or save. Free.</p>
        </div>
      </div>
      <BulkLetters workspaceId={workspace.id} settings={settings} canSave={workspace.access !== "view"} initialType={bulkTemplate(type ?? "") ? (type as string) : "offer"} />
    </AppShell>
  );
}
