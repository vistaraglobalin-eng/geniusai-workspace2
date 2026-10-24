import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadDoc, loadInvoiceData } from "@/lib/invoices/server";
import type { DocKind } from "@/lib/invoices/render";
import { InvoiceEditor } from "../InvoiceEditor";

export const metadata: Metadata = { title: "New invoice · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const { kind: k, from: fromId } = await searchParams;
  const kind: DocKind = k === "quotation" || k === "receipt" ? k : "invoice";
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/invoices/new");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings, customers } = await loadInvoiceData(supabase, workspace.id);
  const from = fromId ? await loadDoc(supabase, fromId) : null;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="invoices" breadcrumb="Invoices & Receipts">
      <InvoiceEditor workspaceId={workspace.id} settings={settings} customers={customers} initial={null} kind={kind} from={from && from.workspace_id === workspace.id ? from : null} />
    </AppShell>
  );
}
