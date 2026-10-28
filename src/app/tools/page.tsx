import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FilePen, FileStack, FileText, MessageSquareText, PenLine, Signature, Send, Image as ImageIcon, ReceiptText, BriefcaseBusiness, Mail, Wallet, GitCompareArrows, Landmark, BookCheck, Diff, Network, BookOpen } from "lucide-react";
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
  { href: "/tools/agreements/explain", title: "Explain a contract", text: "Plain-language summary and risks before you sign.", Icon: MessageSquareText, color: "blue" },
  { href: "/tools/agreements/conflicts", title: "Find conflicts", text: "Compare contracts and policies; see where they contradict each other.", Icon: GitCompareArrows, color: "rose" },
  { href: "/tools/agreements/law-impact", title: "New-law impact check", text: "See which contracts must change for a new law, rule or policy.", Icon: Landmark, color: "lavender" },
  { href: "/tools/agreements/playbook", title: "Firm playbook", text: "Check any contract against your own standard terms.", Icon: BookCheck, color: "mint" },
  { href: "/tools/compare", title: "Compare versions", text: "See every change between two drafts, word by word. Free.", Icon: Diff, color: "peach" },
  { href: "/tools/read", title: "Read mode", text: "Any PDF or Word file as easy-to-read text on your phone. Free.", Icon: BookOpen, color: "mint" },
  { href: "/tools/agreements/clause-map", title: "Clause map", text: "How a contract's clauses and definitions connect, and what's broken.", Icon: Network, color: "blue" },
  { href: "/tools/sign/requests", title: "Request signatures", text: "Send a PDF for others to sign by private link. Free.", Icon: Send, color: "mint" },
  { href: "/tools/invoices", title: "Invoices & Receipts", text: "GST invoices, quotations and receipts with UPI QR. Free.", Icon: ReceiptText, color: "mint" },
  { href: "/tools/expenses", title: "Expense tracker", text: "Photograph bills, track spending by category, export for your CA. Free.", Icon: Wallet, color: "rose" },
  { href: "/tools/letters", title: "Letters & visiting cards", text: "Visiting cards, letterhead, offer letters, salary slips and rent receipts. Free.", Icon: Mail, color: "blue" },
  { href: "/tools/career", title: "Resume & Career Studio", text: "ATS-friendly resumes, job match and cover letters.", Icon: BriefcaseBusiness, color: "lavender" },
  { href: "/tools/photos", title: "Product Photos & Ads", text: "Remove backgrounds, marketplace photos and ad posts. Free.", Icon: ImageIcon, color: "peach" }
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
