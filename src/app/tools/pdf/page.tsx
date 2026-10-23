import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Signature, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PDF_TOOLS, TOOL_GROUPS, TOOL_INFO, isWorkerTool } from "@/lib/pdf/catalog";
import { isWorkerConfigured } from "@/lib/pdf/worker";
import { AI_TOOL_LINKS, PDF_TOOL_ICONS } from "@/components/ToolIcons";

export const metadata: Metadata = { title: "PDF Toolkit · GeniusAI Workspace" };

const GROUP_CLASS = { Organize: "peach", Optimize: "mint", Edit: "rose", Security: "lavender", Convert: "blue" } as const;
const GROUP_LEAD = {
  Organize: "Combine, split and rearrange pages.",
  Optimize: "Make PDFs smaller, or fix ones that won't open.",
  Edit: "Rotate, number and stamp pages.",
  Security: "Add or remove a password.",
  Convert: "Between PDF, Office files and images."
} as const;

export default async function PdfToolkitPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/pdf");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const workerReady = isWorkerConfigured();

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="pdf" breadcrumb="PDF Toolkit">
      <div className="welcome-row">
        <div>
          <h1>Every PDF tool, <span>one place.</span></h1>
          <p className="subtitle">Instant tools are free and never change your original. Results are saved to Files.</p>
        </div>
      </div>

      <div className="pdf-groups">
        {TOOL_GROUPS.map((group) => (
          <section key={group} className="pdf-group" aria-labelledby={`g-${group}`}>
            <div className="pdf-group-head">
              <h2 id={`g-${group}`}>{group}</h2>
              <p>{GROUP_LEAD[group]}</p>
            </div>
            <div className="pdf-tool-grid">
              {PDF_TOOLS.filter((t) => TOOL_INFO[t].group === group).map((t) => {
                const Icon = PDF_TOOL_ICONS[t];
                return (
                  <Link key={t} href={`/tools/pdf/${t}`} className="pdf-tool">
                    <span className={`tool-icon ${GROUP_CLASS[group]}`}><Icon size={20} aria-hidden="true" /></span>
                    <span className="pdf-tool-text">
                      <strong>{TOOL_INFO[t].title}{isWorkerTool(t) && !workerReady && <em className="scan-badge pending">Setup needed</em>}</strong>
                      <span>{TOOL_INFO[t].description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <section className="pdf-group" aria-labelledby="g-sign">
          <div className="pdf-group-head">
            <h2 id="g-sign">Sign</h2>
            <p>Draw or type your signature and place it on any page.</p>
          </div>
          <div className="pdf-tool-grid">
            <Link href="/tools/sign" className="pdf-tool">
              <span className="tool-icon rose"><Signature size={20} aria-hidden="true" /></span>
              <span className="pdf-tool-text"><strong>Sign PDF</strong><span>Add your signature and today&apos;s date, with a signing record. Free.</span></span>
            </Link>
          </div>
        </section>

        <section className="pdf-group" aria-labelledby="g-ai">
          <div className="pdf-group-head">
            <h2 id="g-ai"><Sparkles size={16} aria-hidden="true" /> AI tools</h2>
            <p>Powered by Document Genius. Uses credits; the cost is shown before anything runs.</p>
          </div>
          <div className="pdf-tool-grid">
            {AI_TOOL_LINKS.map(({ task, title, description, Icon }) => (
              <Link key={task} href={`/tools/documents?task=${task}`} className="pdf-tool">
                <span className="tool-icon lavender"><Icon size={20} aria-hidden="true" /></span>
                <span className="pdf-tool-text"><strong>{title}</strong><span>{description}</span></span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <p className="dg-hint" style={{ marginTop: 18 }}>
        Coming later: request signatures from others, fill PDF forms, redact PDF, compare PDFs, PDF to Word/PowerPoint.
      </p>
    </AppShell>
  );
}
