import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PenLine, Signature } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PDF_TOOLS, TOOL_GROUPS, TOOL_INFO, isWorkerTool } from "@/lib/pdf/catalog";
import { isWorkerConfigured } from "@/lib/pdf/worker";
import { AI_TOOL_LINKS, PDF_TOOL_ICONS } from "@/components/ToolIcons";
import { ListRow } from "@/components/ListRow";

export const metadata: Metadata = { title: "PDF Toolkit · GeniusAI Workspace" };

const GROUP_TINT = { Organize: "orange", Optimize: "green", Edit: "blue", Security: "gray", Convert: "indigo" } as const;
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
          <h1>PDF Toolkit</h1>
          <p className="subtitle">Instant tools are free and never change your original. Results are saved to Files.</p>
        </div>
      </div>

      <div className="service-groups pdf-hub">
        {TOOL_GROUPS.map((group) => (
          <section key={group} className="service-group" aria-labelledby={`g-${group}`}>
            <h2 id={`g-${group}`}>{group}</h2>
            <p className="group-lead">{GROUP_LEAD[group]}</p>
            <ul className="list-card">
              {group === "Edit" && (
                <ListRow href="/tools/edit" tint="blue" icon={<PenLine size={17} aria-hidden="true" />} title="Edit PDF" text="Add text, whiteout, highlight, draw, images" />
              )}
              {PDF_TOOLS.filter((t) => TOOL_INFO[t].group === group).map((t) => {
                const Icon = PDF_TOOL_ICONS[t];
                return (
                  <ListRow key={t} href={`/tools/pdf/${t}`} tint={GROUP_TINT[group]} icon={<Icon size={17} aria-hidden="true" />}
                    title={TOOL_INFO[t].title} text={TOOL_INFO[t].description}
                    badge={isWorkerTool(t) && t !== "pdf-to-jpg" && !workerReady ? <span className="soon-tag">Setup needed</span> : undefined} />
                );
              })}
            </ul>
          </section>
        ))}

        <section className="service-group" aria-labelledby="g-sign">
          <h2 id="g-sign">Sign</h2>
          <p className="group-lead">Draw or type your signature and place it on any page.</p>
          <ul className="list-card">
            <ListRow href="/tools/sign" tint="green" icon={<Signature size={17} aria-hidden="true" />} title="Sign PDF" text="With today’s date and a signing record. Free." />
          </ul>
        </section>

        <section className="service-group" aria-labelledby="g-ai">
          <h2 id="g-ai">AI tools</h2>
          <p className="group-lead">Use credits; the cost is shown before anything runs.</p>
          <ul className="list-card">
            {AI_TOOL_LINKS.map(({ task, title, description, Icon }) => (
              <ListRow key={task} href={`/tools/documents?task=${task}`} tint="teal" icon={<Icon size={17} aria-hidden="true" />} title={title} text={description} />
            ))}
          </ul>
        </section>
      </div>

      <p className="dg-hint" style={{ marginTop: 18 }}>
        Coming later: request signatures, fill PDF forms, edit existing text in place, redact, compare PDFs, PDF to Word/PowerPoint.
      </p>
    </AppShell>
  );
}
