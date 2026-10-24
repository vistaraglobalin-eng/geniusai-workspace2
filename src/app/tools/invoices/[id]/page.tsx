import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadDoc, loadInvoiceData } from "@/lib/invoices/server";
import { InvoiceEditor } from "../InvoiceEditor";

export const metadata: Metadata = { title: "Invoice · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=/tools/invoices/${id}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const doc = await loadDoc(supabase, id);
  if (!doc || doc.workspace_id !== workspace.id) notFound();
  const { settings, customers } = await loadInvoiceData(supabase, workspace.id);
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="invoices" breadcrumb="Invoices & Receipts">
      <InvoiceEditor key={doc.id} workspaceId={workspace.id} settings={settings} customers={customers} initial={doc} kind={doc.kind} />
    </AppShell>
  );
}
