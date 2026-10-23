import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight, BriefcaseBusiness, FileText, Image as ImageIcon,
  ReceiptText, Scale, Signature, ShieldCheck
} from "lucide-react";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { SetupNotice } from "@/components/SetupNotice";
import { UploadButton } from "@/components/UploadButton";
import { RecentFiles } from "@/components/RecentFiles";
import { AppShell, firstNameOf } from "@/components/AppShell";
import { PDF_TOOL_ICONS } from "@/components/ToolIcons";
import { PDF_TOOLS, TOOL_INFO } from "@/lib/pdf/catalog";
import { Landing } from "@/components/Landing";
import { PromptBox } from "@/components/PromptBox";

const tools = [
  { number: "01", title: "Document Genius", description: "Summarize, translate, OCR, Markdown and tables from documents.", detail: "Summary · Translate · OCR · Tables", icon: FileText, color: "lavender", status: "Ready", href: "/tools/documents" },
  { number: "02", title: "Resume & Career Studio", description: "Build a resume and tailor applications to a role.", detail: "Resume · Cover letter · Interview prep", icon: BriefcaseBusiness, color: "mint", status: "Coming soon" },
  { number: "03", title: "Product Photo & Ad Studio", description: "Create polished product visuals and ad copy.", detail: "Backgrounds · Creatives · Ad copy", icon: ImageIcon, color: "peach", status: "Coming soon" },
  { number: "04", title: "Invoice & Receipt Manager", description: "Create invoices and turn receipts into organized records.", detail: "Invoices · OCR · CSV export", icon: ReceiptText, color: "blue", status: "Coming soon" },
  { number: "05", title: "Agreement Studio", description: "Draft India-ready agreements with AI and explain contracts before you sign.", detail: "8 templates · AI revise · Versions · Word/PDF", icon: Scale, color: "rose", status: "Ready", href: "/tools/agreements" }
] as const;

export default async function Home() {
  if (!getSupabasePublicEnv().configured) return <SetupNotice />;

  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return <Landing />;
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const credits = ctx.credits ?? { available: 0, reserved: 0 };
  const planName = ctx.plan?.name ?? "Free";
  const planStatus = ctx.plan?.status ?? "free";

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="overview" breadcrumb="Overview">
      <div className="welcome-row">
        <div><h1>Welcome, <span>{firstNameOf(ctx)}.</span></h1><p className="subtitle">Your documents, agreements and PDFs in one place.</p></div>
        <UploadButton workspaceId={workspace.id} />
      </div>

      <section className="hero-card" aria-label="Get started">
        <h2>What do you want to get done?</h2>
        <PromptBox heading="Describe an agreement and the AI drafts it" compact />
        <div className="hero-links">
          <Link href="/tools/documents">Summarize or translate a document</Link>
          <Link href="/tools/sign">Sign a PDF</Link>
          <Link href="/tools/pdf">PDF tools</Link>
        </div>
      </section>

      <div className="section-heading">
        <div><h2>Quick PDF tools</h2><p>Free and instant. Results are saved to Files.</p></div>
        <Link className="tool-count" href="/tools/pdf">See all</Link>
      </div>
      <nav className="quick-tools" aria-label="Quick PDF tools">
        <Link href="/tools/sign" className="quick-tool"><Signature size={16} aria-hidden="true" />Sign PDF</Link>
        {(["merge", "split", "compress", "images-to-pdf", "protect"] as const).filter((t) => PDF_TOOLS.includes(t)).map((t) => {
          const Icon = PDF_TOOL_ICONS[t];
          return <Link key={t} href={`/tools/pdf/${t}`} className="quick-tool"><Icon size={16} aria-hidden="true" />{TOOL_INFO[t].title}</Link>;
        })}
      </nav>

      <div className="section-heading" id="tools"><div><h2>Your tools</h2><p>Choose a tool to get started.</p></div></div>
      <div className="tool-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const ready = "href" in tool;
          const inner = <>
            <div className="tool-card-top"><div className={`tool-icon ${tool.color}`}><Icon size={22}/></div></div>
            <h3>{tool.title}</h3><p>{tool.description}</p><div className="tool-detail">{tool.detail}</div>
            <div className="tool-card-bottom"><span className={`status-dot${ready ? " ready" : ""}`}/><span>{tool.status}</span>{ready && <ArrowUpRight size={16} className="card-arrow"/>}</div>
          </>;
          return ready
            ? <Link className="tool-card tool-card-link" key={tool.number} href={tool.href}>{inner}</Link>
            : <article className="tool-card tool-card-soon" key={tool.number}>{inner}</article>;
        })}
      </div>

      <div className="bottom-grid" id="recent">
        <section className="panel-card">
          <div className="panel-title"><div><h3>Recent files</h3><p>The latest uploads in {workspace.name}.</p></div><Link href="/files">View all</Link></div>
          <RecentFiles files={ctx.recentFiles} currentUserId={ctx.user.id} role={workspace.role} />
        </section>
        <section className="panel-card" id="plans">
          <div className="panel-title"><div><h3>Your plan</h3><p>Simple tools, transparent usage.</p></div><Link href="/billing">Buy credits</Link></div>
          <div className="plan-row"><div><span className="plan-label">Current plan</span><strong>{planName}</strong></div><span className="plan-pill">{planStatus}</span></div>
          <div className="credit-stats">
            <div><span className="plan-label">Available credits</span><strong>{credits.available.toLocaleString("en-IN")}</strong></div>
            <div><span className="plan-label">In use</span><strong>{credits.reserved.toLocaleString("en-IN")}</strong></div>
          </div>
          <div className="plan-foot"><span>1 credit ≈ 750 words read. Writing costs 5× more than reading.</span><ShieldCheck size={15}/></div>
        </section>
      </div>
      <footer>GeniusAI Workspace <span>•</span> Files are stored privately in your workspace. AI tools send a file to the AI provider only when you run a task on it.</footer>
    </AppShell>
  );
}
