import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { getTemplate } from "@/lib/agreements/templates";
import { isWorkerConfigured } from "@/lib/pdf/worker";
import { loadAgreement } from "@/lib/agreements/server";
import { AgreementEditor, type VersionInfo } from "./AgreementEditor";

export const metadata: Metadata = { title: "Agreement · GeniusAI Workspace" };

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/tools/agreements/${id}`)}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const agreement = await loadAgreement(supabase, id);
  if (!agreement) notFound();
  const { data: versions } = await supabase
    .from("agreement_versions")
    .select("version, source, note, created_at")
    .eq("agreement_id", agreement.id)
    .order("version", { ascending: false })
    .limit(50);

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="agreements" breadcrumb="Agreement Studio">
      <Link href="/tools/agreements" className="back-link no-print"><ArrowLeft size={16} aria-hidden="true" /> Agreement Studio</Link>
      <AgreementEditor
        key={agreement.id}
        agreement={{
          id: agreement.id, title: agreement.title, content: agreement.content_md, version: agreement.current_version,
          status: agreement.status === "final" ? "final" : "draft", templateTitle: getTemplate(agreement.template_key)?.title ?? "Custom document"
        }}
        versions={(versions ?? []) as VersionInfo[]}
        creditsAvailable={ctx.credits?.available ?? 0}
        pdfSaveAvailable={isWorkerConfigured()}
      />
    </AppShell>
  );
}
