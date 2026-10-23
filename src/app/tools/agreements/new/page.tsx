import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { getTemplate } from "@/lib/agreements/templates";
import { MAX_PROMPT_CHARS } from "@/lib/agreements/prompts";
import { AgreementForm } from "./AgreementForm";

export const metadata: Metadata = { title: "New agreement · GeniusAI Workspace" };

export default async function NewAgreementPage({ searchParams }: { searchParams: Promise<{ template?: string; prompt?: string }> }) {
  const params = await searchParams;
  const template = params.template ? getTemplate(params.template) : undefined;
  const prompt = typeof params.prompt === "string" ? params.prompt.slice(0, MAX_PROMPT_CHARS) : "";

  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) {
    const back = template ? `/tools/agreements/new?template=${template.key}` : `/tools/agreements/new?prompt=${encodeURIComponent(prompt)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="agreements" breadcrumb="New agreement">
      <Link href="/tools/agreements" className="back-link"><ArrowLeft size={16} aria-hidden="true" /> Agreement Studio</Link>
      <div className="welcome-row">
        <div>
          <h1>{template ? template.title : <>Describe your <span>document</span></>}</h1>
          <p className="subtitle">{template ? template.description : "Tell the AI what you need. It will draft a complete first version you can edit."}</p>
        </div>
      </div>
      <AgreementForm templateKey={template?.key ?? "custom"} initialPrompt={prompt} creditsAvailable={ctx.credits?.available ?? 0} />
    </AppShell>
  );
}
