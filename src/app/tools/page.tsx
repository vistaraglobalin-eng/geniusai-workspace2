import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FilePen, FileStack, FileText, MessageSquareText, PenLine, Signature } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PDF_TOOL_ICONS } from "@/components/ToolIcons";
import { PDF_TOOLS, TOOL_INFO } from "@/lib/pdf/catalog";

export const metadata: Metadata = { title: "All tools · GeniusAI Workspace" };

const HUBS = [
  { href: "/tools/pdf", title: "PDF Toolkit", text: "Merge, split, compress, protect, convert and more. Free.", Icon: FileStack, color: "peach" },
  { href: "/tools/documents", title: "Document Genius", text: "AI summaries, translation, OCR, Markdown and tables.", Icon: FileText, color: "lavender" },
  { href: "/tools/agreements", title: "Agreement Studio", text: "Draft India-ready agreements with AI, edit and export.", Icon: FilePen, color: "rose" },
  { href: "/tools/edit", title: "Edit PDF", text: "Add text, whiteout, highlight, notes, drawings and images.", Icon: PenLine, color: "blue" },
  { href: "/tools/sign", title: "Sign PDF", text: "Draw or type your signature and place it on any PDF. Free.", Icon: Signature, color: "mint" },
  { href: "/tools/agreements/explain", title: "Explain a contract", text: "Plain-language summary and risks before you sign.", Icon: MessageSquareText, color: "blue" }
] as const;

/** One place for every tool (the phone "Tools" tab lands here). */
export default async function ToolsPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="tools" breadcrumb="All tools">
      <div className="welcome-row"><div><h1>What do you need <span>to do?</span></h1></div></div>
      <div className="tool-grid tools-hub">
        {HUBS.map(({ href, title, text, Icon, color }) => (
          <Link key={href} href={href} className="tool-card tool-card-link">
            <div className="tool-card-top"><div className={`tool-icon ${color}`}><Icon size={22} aria-hidden="true" /></div><ArrowUpRight size={16} className="card-arrow" aria-hidden="true" /></div>
            <h3>{title}</h3><p>{text}</p>
          </Link>
        ))}
      </div>
      <div className="section-heading"><div><h2>PDF tools</h2><p>Jump straight in.</p></div></div>
      <nav className="quick-tools" aria-label="PDF tools">
        {PDF_TOOLS.map((t) => {
          const Icon = PDF_TOOL_ICONS[t];
          return <Link key={t} href={`/tools/pdf/${t}`} className="quick-tool"><Icon size={16} aria-hidden="true" />{TOOL_INFO[t].title}</Link>;
        })}
      </nav>
    </AppShell>
  );
}
