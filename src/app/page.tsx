import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BriefcaseBusiness, ChevronRight, Mail, Wallet, Combine, PenLine, FileInput, FilePen, FileText, Image as ImageIcon, Languages,
  Layers, ListChecks, Lock, MessageSquareText, Minimize2, ReceiptText, ScanText, Scissors, Send, Signature, Table, Zap
} from "lucide-react";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { SetupNotice } from "@/components/SetupNotice";
import { UploadButton } from "@/components/UploadButton";
import { RecentFiles } from "@/components/RecentFiles";
import { AppShell, firstNameOf } from "@/components/AppShell";
import { Landing } from "@/components/Landing";
import { PromptBox } from "@/components/PromptBox";
import { getTemplate } from "@/lib/agreements/templates";

type Row = { href?: string; title: string; text: string; Icon: typeof FileText; tint: string; soon?: boolean };

// Every service, grouped by the job people come to do.
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Create & sign",
    rows: [
      { href: "/tools/agreements", title: "Agreement Studio", text: "Draft India-ready agreements with AI", Icon: FilePen, tint: "indigo" },
      { href: "/tools/agreements#templates", title: "Templates", text: "NDA, rental, employment and more", Icon: Layers, tint: "purple" },
      { href: "/tools/sign", title: "Sign PDF", text: "Draw or type your signature", Icon: Signature, tint: "green" },
      { href: "/tools/edit", title: "Edit PDF", text: "Edit text, mark up, shapes, links, forms", Icon: PenLine, tint: "blue" },
      { href: "/tools/sign/requests", title: "Request signatures", text: "Send a PDF for others to sign by link", Icon: Send, tint: "teal" }
    ]
  },
  {
    title: "Grow your business",
    rows: [
      { href: "/tools/invoices", title: "Invoices & Receipts", text: "GST invoices, quotations, UPI QR, receipts", Icon: ReceiptText, tint: "green" },
      { href: "/tools/photos", title: "Product Photos & Ads", text: "Remove background, marketplace photos, ad posts", Icon: ImageIcon, tint: "orange" },
      { href: "/tools/expenses", title: "Expense tracker", text: "Bills, monthly totals, export for your CA", Icon: Wallet, tint: "red" },
      { href: "/tools/letters", title: "Letters & visiting cards", text: "Visiting cards, letterhead, offer letters, salary slips", Icon: Mail, tint: "blue" },
      { href: "/tools/career", title: "Resume & Career Studio", text: "Resumes, job match, cover letters", Icon: BriefcaseBusiness, tint: "purple" }
    ]
  },
  {
    title: "Understand documents",
    rows: [
      { href: "/tools/agreements/explain", title: "Explain a contract", text: "Plain-language summary and risks", Icon: MessageSquareText, tint: "orange" },
      { href: "/tools/documents?task=summary", title: "Summarize", text: "Key points from long documents", Icon: ListChecks, tint: "blue" },
      { href: "/tools/documents?task=translate", title: "Translate", text: "Into 25 languages, incl. Hindi", Icon: Languages, tint: "teal" },
      { href: "/tools/documents?task=extract_text", title: "Extract text", text: "From scans and photos (OCR)", Icon: ScanText, tint: "cyan" },
      { href: "/tools/documents?task=tables", title: "Extract tables", text: "To a spreadsheet you can edit", Icon: Table, tint: "green" }
    ]
  },
  {
    title: "PDF tools",
    rows: [
      { href: "/tools/pdf/merge", title: "Merge PDFs", text: "Combine files in the order you want", Icon: Combine, tint: "red" },
      { href: "/tools/pdf/split", title: "Split PDF", text: "By page ranges or every few pages", Icon: Scissors, tint: "orange" },
      { href: "/tools/pdf/compress", title: "Compress PDF", text: "Make files smaller to share", Icon: Minimize2, tint: "green" },
      { href: "/tools/pdf/office-to-pdf", title: "Convert to PDF", text: "Word, Excel, PowerPoint, images", Icon: FileInput, tint: "blue" },
      { href: "/tools/pdf/protect", title: "Protect PDF", text: "Add a password", Icon: Lock, tint: "gray" },
      { href: "/tools/pdf", title: "All PDF tools", text: "Rotate, reorder, number, watermark…", Icon: FileText, tint: "indigo" }
    ]
  }
];

const ACTIONS = [
  { href: "/tools/agreements/new", label: "Draft", Icon: FilePen, tint: "indigo" },
  { href: "/tools/agreements/explain", label: "Explain", Icon: MessageSquareText, tint: "orange" },
  { href: "/tools/sign", label: "Sign", Icon: Signature, tint: "green" },
  { href: "/tools/documents?task=summary", label: "Summarize", Icon: ListChecks, tint: "blue" },
  { href: "/tools/documents?task=translate", label: "Translate", Icon: Languages, tint: "teal" },
  { href: "/tools/pdf/merge", label: "Merge", Icon: Combine, tint: "red" }
] as const;

const SOON: { title: string; Icon: typeof FileText }[] = [];

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function Home() {
  if (!getSupabasePublicEnv().configured) return <SetupNotice />;

  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return <Landing />;
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const credits = ctx.credits ?? { available: 0, reserved: 0 };

  const { data: agreementRows } = await supabase
    .from("agreements")
    .select("id, title, template_key, status, updated_at")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(4);
  const agreements = (agreementRows ?? []) as { id: string; title: string; template_key: string; status: string; updated_at: string }[];

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);
  const shortDate = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="overview" breadcrumb="Home">
      <header className="dash-head">
        <div>
          <p className="dash-date">{today}</p>
          <h1>{greeting(now)}, {firstNameOf(ctx)}</h1>
        </div>
        <div className="dash-head-actions">
          <Link href="/billing" className="credit-pill" title="Plans & credits"><Zap size={15} aria-hidden="true" />{credits.available.toLocaleString("en-IN")} credits</Link>
          <UploadButton workspaceId={workspace.id} label="Upload" />
        </div>
      </header>

      <section className="ask-card" aria-labelledby="ask-title">
        <h2 id="ask-title">What do you want to get done?</h2>
        <PromptBox heading="Describe an agreement and GeniusAI drafts it" compact />
        <nav className="action-row" aria-label="Shortcuts">
          {ACTIONS.map(({ href, label, Icon, tint }) => (
            <Link key={label} href={href} className="action">
              <span className={`app-icon lg ${tint}`}><Icon size={22} aria-hidden="true" /></span>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </section>

      <div className="service-groups">
        {GROUPS.map((g) => (
          <section key={g.title} className="service-group" aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`}>{g.title}</h2>
            <ul className="list-card">
              {g.rows.map(({ href, title, text, Icon, tint, soon }) => {
                const inner = (
                  <>
                    <span className={`app-icon ${tint}`}><Icon size={17} aria-hidden="true" /></span>
                    <span className="list-text"><strong>{title}</strong><span>{text}</span></span>
                    {soon ? <span className="soon-tag">Soon</span> : <ChevronRight size={17} className="list-chevron" aria-hidden="true" />}
                  </>
                );
                return <li key={title}>{href && !soon ? <Link href={href} className="list-row">{inner}</Link> : <div className="list-row muted">{inner}</div>}</li>;
              })}
            </ul>
          </section>
        ))}
      </div>

      <h2 className="dash-section-title">Continue where you left off</h2>
      <div className="continue-grid">
        <section className="panel-card" aria-labelledby="recent-agreements">
          <div className="panel-title"><div><h3 id="recent-agreements">Agreements</h3></div><Link href="/tools/agreements">See all</Link></div>
          {agreements.length === 0 ? (
            <p className="dash-empty">No agreements yet. <Link href="/tools/agreements">Draft your first one</Link>.</p>
          ) : (
            <ul className="mini-list">
              {agreements.map((a) => (
                <li key={a.id}>
                  <Link href={`/tools/agreements/${a.id}`}>
                    <span className="mini-title">{a.title}</span>
                    <span className="mini-meta">{getTemplate(a.template_key)?.title ?? "Custom document"}, {shortDate(a.updated_at)}</span>
                  </Link>
                  <span className={`as-status ${a.status}`}>{a.status === "final" ? "Final" : "Draft"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel-card" aria-labelledby="recent-files">
          <div className="panel-title"><div><h3 id="recent-files">Files</h3></div><Link href="/files">See all</Link></div>
          <RecentFiles files={ctx.recentFiles.slice(0, 4)} currentUserId={ctx.user.id} role={workspace.role} />
        </section>
        <section className="panel-card credits-card" aria-labelledby="credits-h">
          <div className="panel-title"><div><h3 id="credits-h">Credits</h3></div><Link href="/billing">Buy credits</Link></div>
          <p className="credits-big">{credits.available.toLocaleString("en-IN")}</p>
          <p className="dash-empty">available for AI tools{credits.reserved > 0 ? `, ${credits.reserved.toLocaleString("en-IN")} in use now` : ""}. PDF tools and signing are free.</p>
          <p className="dash-fine">A typical agreement draft uses 10–25 credits.</p>
        </section>
      </div>

      {SOON.length > 0 && (
      <section className="soon-row" aria-labelledby="soon-h">
        <h2 id="soon-h" className="dash-section-title">Coming soon</h2>
        <div className="soon-list">
          {SOON.map(({ title, Icon }) => (
            <span key={title} className="soon-item"><span className="app-icon gray"><Icon size={16} aria-hidden="true" /></span>{title}</span>
          ))}
        </div>
      </section>
      )}

      <footer>Files are stored privately in {workspace.name}. AI tools send a file to the AI provider only when you run a task on it.</footer>
    </AppShell>
  );
}
