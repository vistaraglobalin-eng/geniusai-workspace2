import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FilePen, FileStack, FileText, MessageSquareText, PenLine, Signature, Send, Image as ImageIcon, ReceiptText, BriefcaseBusiness, Mail, Wallet, GitCompareArrows, Landmark, BookCheck, Diff, Network, BookOpen, GraduationCap, FileSpreadsheet, ScrollText, TrendingUp } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PDF_TOOL_ICONS } from "@/components/ToolIcons";
import { PDF_TOOLS, TOOL_INFO } from "@/lib/pdf/catalog";
import { getLang, t } from "@/lib/i18n-server";

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
  { href: "/tools/study", title: "Quizzes & flashcards", text: "Turn notes or a chapter into a practice quiz or flashcards.", Icon: GraduationCap, color: "lavender" },
  { href: "/tools/exam", title: "Question paper maker", text: "A full exam paper with sections, marks and an answer key, from any chapter.", Icon: ScrollText, color: "peach" },
  { href: "/tools/policies", title: "Company policy Q&A", text: "Employees ask questions and get answers from your own HR policies, with sources.", Icon: BookCheck, color: "blue" },
  { href: "/tools/agreements/clause-map", title: "Clause map", text: "How a contract's clauses and definitions connect, and what's broken.", Icon: Network, color: "blue" },
  { href: "/tools/sign/requests", title: "Request signatures", text: "Send a PDF for others to sign by private link. Free.", Icon: Send, color: "mint" },
  { href: "/tools/invoices", title: "Invoices & Receipts", text: "GST invoices, quotations and receipts with UPI QR. Free.", Icon: ReceiptText, color: "mint" },
  { href: "/tools/expenses", title: "Expense tracker", text: "Photograph bills, track spending by category, export for your CA. Free.", Icon: Wallet, color: "rose" },
  { href: "/tools/statement", title: "Bank statement to Excel", text: "Any bank statement PDF or photo into a checked Excel sheet.", Icon: FileSpreadsheet, color: "mint" },
  { href: "/tools/sales", title: "Sales report", text: "Shopify, Stripe and HubSpot sales in one report, with AI next steps", Icon: TrendingUp, color: "blue" },
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
  const lang = await getLang();
  const tr = (s: string) => t(lang, s);

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="tools" breadcrumb="All tools">
      <div className="welcome-row"><div><h1>{tr("What do you need")} <span>{tr("to do?")}</span></h1></div></div>
      <div className="tool-grid tools-hub">
        {HUBS.map(({ href, title, text, Icon, color }) => (
          <Link key={href} href={href} className="tool-card tool-card-link">
            <div className="tool-card-top"><div className={`tool-icon ${color}`}><Icon size={22} aria-hidden="true" /></div><ArrowUpRight size={16} className="card-arrow" aria-hidden="true" /></div>
            <h3>{tr(title)}</h3><p>{tr(text)}</p>
          </Link>
        ))}
      </div>
      <div className="section-heading"><div><h2>{tr("PDF tools")}</h2><p>{tr("Jump straight in.")}</p></div></div>
      <nav className="quick-tools" aria-label={tr("PDF tools")}>
        {PDF_TOOLS.map((tool) => {
          const Icon = PDF_TOOL_ICONS[tool];
          return <Link key={tool} href={`/tools/pdf/${tool}`} className="quick-tool"><Icon size={16} aria-hidden="true" />{tr(TOOL_INFO[tool].title)}</Link>;
        })}
      </nav>
    </AppShell>
  );
}
