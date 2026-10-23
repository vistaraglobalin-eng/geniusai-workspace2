import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FilePen, MessageSquareText } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PromptBox } from "@/components/PromptBox";
import { TEMPLATE_ICONS } from "@/components/AgreementIcons";
import { TEMPLATES, getTemplate } from "@/lib/agreements/templates";
import { DISCLAIMER } from "@/lib/agreements/prompts";

export const metadata: Metadata = { title: "Agreement Studio · GeniusAI Workspace" };

type Row = { id: string; title: string; template_key: string; status: string; current_version: number; updated_at: string };

export default async function AgreementStudioPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/agreements");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data } = await supabase
    .from("agreements")
    .select("id, title, template_key, status, current_version, updated_at")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Row[];

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="agreements" breadcrumb="Agreement Studio">
      <div className="welcome-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot"/> TOOL 05</div>
          <h1>Agreement <span>Studio</span></h1>
          <p className="subtitle">Draft India-ready agreements with AI, edit them with version history, and understand any contract before you sign.</p>
        </div>
      </div>

      <section className="panel-card as-hero">
        <PromptBox />
      </section>

      <div className="section-heading"><div><h2>Start from a template</h2><p>Answer a few questions; the AI writes the first draft.</p></div><span className="tool-count">{TEMPLATES.length} TEMPLATES</span></div>
      <div className="as-templates">
        {TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICONS[t.key] ?? FilePen;
          return (
            <Link key={t.key} href={`/tools/agreements/new?template=${t.key}`} className="as-template">
              <span className="as-template-icon"><Icon size={20} aria-hidden="true" /></span>
              <span className="as-template-text"><strong>{t.title}</strong><span>{t.description}</span></span>
              <span className="as-cat">{t.category}</span>
            </Link>
          );
        })}
        <Link href="/tools/agreements/explain" className="as-template as-explain">
          <span className="as-template-icon"><MessageSquareText size={20} aria-hidden="true" /></span>
          <span className="as-template-text"><strong>Explain a contract</strong><span>Upload an agreement you received: plain-language summary, risks and questions to ask.</span></span>
          <span className="as-cat">Review</span>
        </Link>
      </div>

      <section className="panel-card" aria-labelledby="my-agreements">
        <div className="panel-title"><div><h3 id="my-agreements">Your agreements</h3><p>Drafts and final versions in {workspace.name}.</p></div></div>
        {rows.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FilePen size={22} aria-hidden="true" /></div><p>No agreements yet. Describe one above or pick a template.</p></div>
        ) : (
          <ul className="file-list">
            {rows.map((r) => {
              const Icon = TEMPLATE_ICONS[r.template_key] ?? FilePen;
              return (
                <li key={r.id} className="file-row">
                  <span className="file-icon"><Icon size={18} aria-hidden="true" /></span>
                  <Link href={`/tools/agreements/${r.id}`} className="file-meta as-row-link">
                    <strong>{r.title}</strong>
                    <span>{getTemplate(r.template_key)?.title ?? "Custom document"} · v{r.current_version} · {new Date(r.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </Link>
                  <span className={`as-status ${r.status}`}>{r.status === "final" ? "Final" : "Draft"}</span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="dg-disclaimer">{DISCLAIMER}</p>
    </AppShell>
  );
}
