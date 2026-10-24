import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BriefcaseBusiness, FileText } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { TEMPLATES } from "@/lib/career/resume";
import { NewResumeButton, ResumeRowActions } from "./ResumeActions";

export const metadata: Metadata = { title: "Resume & Career Studio · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function CareerPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/career");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { data, error } = await supabase.from("resumes").select("id, title, template, updated_at").eq("workspace_id", workspace.id).order("updated_at", { ascending: false }).limit(100);
  const setupNeeded = !!error && /does not exist|schema cache/i.test(error.message);
  const rows = (data ?? []) as { id: string; title: string; template: string; updated_at: string }[];
  const when = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
  const name = ctx.displayName?.trim() || "", email = ctx.user.email ?? "";

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="career" breadcrumb="Resume & Career Studio">
      <div className="welcome-row">
        <div>
          <h1>Resume & Career Studio</h1>
          <p className="subtitle">Professional resumes that pass company screening software, a free job-match check, and AI help with your summary, bullet points and cover letters.</p>
        </div>
        {!setupNeeded && <div><NewResumeButton workspaceId={workspace.id} name={name} email={email} /></div>}
      </div>
      {setupNeeded ? (
        <section className="panel-card"><p className="form-message error">Resumes need a one-time database update before they can be used.</p></section>
      ) : rows.length === 0 ? (
        <section className="panel-card empty-state">
          <div className="empty-icon"><BriefcaseBusiness size={22} aria-hidden="true" /></div>
          <p>No resumes yet. Start one; it saves as you type.</p>
          <NewResumeButton workspaceId={workspace.id} name={name} email={email} label="Create my resume" />
        </section>
      ) : (
        <ul className="list-card">
          {rows.map((r) => (
            <li key={r.id} className="cv-row">
              <Link href={`/tools/career/${r.id}`} className="list-row">
                <span className="app-icon purple"><FileText size={17} aria-hidden="true" /></span>
                <span className="list-text"><strong>{r.title}</strong><span>{TEMPLATES.find((t) => t.key === r.template)?.label ?? "Classic"} · edited {when(r.updated_at)}</span></span>
              </Link>
              <ResumeRowActions id={r.id} workspaceId={workspace.id} />
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
