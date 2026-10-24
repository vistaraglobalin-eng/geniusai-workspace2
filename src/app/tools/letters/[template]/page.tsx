import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { templateFor } from "@/lib/letters/templates";
import { LetterEditor } from "../LetterEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ template: string }> }): Promise<Metadata> {
  const t = templateFor((await params).template);
  return { title: `${t?.label ?? "Letter"} · GeniusAI Workspace` };
}

export default async function LetterPage({ params }: { params: Promise<{ template: string }> }) {
  const { template } = await params;
  const tpl = templateFor(template);
  if (!tpl) notFound();
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=/tools/letters/${template}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings } = await loadInvoiceData(supabase, workspace.id);
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="letters" breadcrumb="Business letters">
      <Link href="/tools/letters" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Business letters</Link>
      <LetterEditor key={tpl.key} templateKey={tpl.key} workspaceId={workspace.id} settings={settings} />
    </AppShell>
  );
}
