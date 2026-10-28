import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, ChevronRight, FileText, ListChecks, ReceiptText, Signature, Wallet, Zap, ScanLine, GitCompareArrows, Landmark, Diff, BookOpen } from "lucide-react";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { SetupNotice } from "@/components/SetupNotice";
import { RecentFiles } from "@/components/RecentFiles";
import { AppShell, firstNameOf } from "@/components/AppShell";
import { Landing } from "@/components/Landing";
import { PromptBox } from "@/components/PromptBox";
import { getTemplate } from "@/lib/agreements/templates";
import { DotRing } from "@/components/DotRing";
import { inr, todayIso } from "@/lib/invoices/calc";
import { localeOf, t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

const ACTIONS = [
  { href: "/tools/invoices/new?kind=invoice", label: "Invoice", Icon: ReceiptText, tint: "green" },
  { href: "/tools/expenses", label: "Expense", Icon: Wallet, tint: "teal" },
  { href: "/tools/invoices/reminders", label: "Remind", Icon: BellRing, tint: "red" },
  { href: "/tools/sign", label: "Sign", Icon: Signature, tint: "indigo" },
  { href: "/tools/documents?task=summary", label: "Summarize", Icon: ListChecks, tint: "cyan" },
  { href: "/tools/scan", label: "Scan", Icon: ScanLine, tint: "orange" }
] as const;

const REVIEW = [
  { href: "/tools/agreements/conflicts", label: "Find conflicts", text: "Where contracts and policies disagree", Icon: GitCompareArrows },
  { href: "/tools/agreements/law-impact", label: "New-law check", text: "Which contracts must change", Icon: Landmark },
  { href: "/tools/compare", label: "Compare versions", text: "Every change between drafts", Icon: Diff },
  { href: "/tools/read", label: "Read mode", text: "Any PDF, easy to read on phone", Icon: BookOpen }
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

  const month = todayIso().slice(0, 7), today = todayIso();
  const [{ data: agreementRows }, { data: invRows }, { data: expRows }] = await Promise.all([
    supabase.from("agreements").select("id, title, template_key, status, updated_at").eq("workspace_id", workspace.id).is("deleted_at", null).order("updated_at", { ascending: false }).limit(4),
    supabase.from("invoices").select("id, number, issue_date, due_date, customer, total, amount_paid, status").eq("workspace_id", workspace.id).eq("kind", "invoice").neq("status", "cancelled").neq("status", "draft").order("due_date", { ascending: true }).limit(1000),
    supabase.from("expenses").select("amount").eq("workspace_id", workspace.id).gte("spent_on", month + "-01").lte("spent_on", month + "-31").limit(5000)
  ]);
  const agreements = (agreementRows ?? []) as { id: string; title: string; template_key: string; status: string; updated_at: string }[];
  type Inv = { id: string; number: string; issue_date: string; due_date: string | null; customer: { name?: string } | null; total: number | string; amount_paid: number | string; status: string };
  const invoices = ((invRows ?? []) as Inv[]).map((r) => ({ ...r, total: Number(r.total), amount_paid: Number(r.amount_paid) }));
  const open = invoices.filter((r) => r.status === "unpaid" || r.status === "partly_paid");
  const due = open.reduce((s, r) => s + Math.max(0, r.total - r.amount_paid), 0);
  const overdue = open.filter((r) => r.due_date && r.due_date < today);
  const overdueAmt = overdue.reduce((s, r) => s + Math.max(0, r.total - r.amount_paid), 0);
  const monthInv = invoices.filter((r) => r.issue_date.startsWith(month));
  const billed = monthInv.reduce((s, r) => s + r.total, 0);
  const collected = monthInv.reduce((s, r) => s + Math.min(r.total, r.amount_paid), 0);
  const pct = billed > 0 ? collected / billed : 0;
  const spent = ((expRows ?? []) as { amount: number | string }[]).reduce((s, r) => s + Number(r.amount), 0);
  const rupees = (n: number) => `₹ ${inr(n, 0)}`;

  const lang = await getLang();
  const tr = (s: string) => t(lang, s);
  const loc = localeOf(lang);
  const now = new Date();
  const todayLong = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);
  const shortDate = (iso: string) => new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="overview" breadcrumb="Home">
      <header className="home-head">
        <div>
          <h1>{tr(greeting(now))}, {firstNameOf(ctx)}</h1>
          <p>{todayLong} · {workspace.name}</p>
        </div>
        <Link href="/billing" className="credit-pill" title={tr("Plans & credits")}><Zap size={15} aria-hidden="true" />{credits.available.toLocaleString("en-IN")}</Link>
      </header>

      <section className="home-hero" aria-label={tr("This month")}>
        <DotRing value={pct} label={`${Math.round(pct * 100)}% ${tr("of this month's invoices collected")}`} />
        <div className="home-figure">
          <span className="pill-accent" style={{ alignSelf: "flex-start" }}>{new Intl.DateTimeFormat(loc, { month: "long", timeZone: "Asia/Kolkata" }).format(now)}</span>
          <span className="home-pct">{Math.round(pct * 100)}%</span>
          <span className="home-pct-label">{billed > 0 ? <>{tr("of this month's invoices collected")} · <b>{rupees(collected)}</b> / {rupees(billed)}</> : <>{tr("No invoices this month yet")} · <Link href="/tools/invoices/new?kind=invoice" style={{ color: "var(--accent-text)", fontWeight: 600 }}>{tr("Create one")}</Link></>}</span>
        </div>
      </section>

      <div className="home-cards">
        <Link href="/tools/invoices" className="home-card"><span>{tr("To collect")}</span><strong>{rupees(due)}</strong><em>{open.length} {tr(open.length === 1 ? "unpaid invoice" : "unpaid invoices")}</em></Link>
        <Link href="/tools/invoices/reminders" className="home-card"><span>{tr("Overdue")}</span><strong className={overdue.length ? "bad" : ""}>{rupees(overdueAmt)}</strong><em>{tr(overdue.length ? "Send reminders ›" : "Nothing overdue")}</em></Link>
        <Link href="/tools/expenses" className="home-card"><span>{tr("Spent this month")}</span><strong>{rupees(spent)}</strong><em>{tr("From your expenses")}</em></Link>
      </div>

      <nav className="quick-row" aria-label={tr("Quick actions")}>
        {ACTIONS.map(({ href, label, Icon, tint }) => (
          <Link key={label} href={href}><span className={`app-icon ${tint}`}><Icon size={24} aria-hidden="true" /></span>{tr(label)}</Link>
        ))}
      </nav>

      <section className="home-review" aria-labelledby="review-h">
        <div className="home-review-head">
          <h2 id="review-h" className="home-section-title">{tr("Review contracts with AI")}</h2>
          <Link href="/tools/agreements#review">{tr("All review tools")} <ChevronRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="home-review-grid">
          {REVIEW.map(({ href, label, text, Icon }) => (
            <Link key={href} href={href} className="home-review-card">
              <span className="app-icon orange"><Icon size={20} aria-hidden="true" /></span>
              <span><strong>{tr(label)}</strong><em>{tr(text)}</em></span>
            </Link>
          ))}
        </div>
      </section>

      {overdue.length > 0 && (
        <section aria-labelledby="attn-h" style={{ marginBottom: 26 }}>
          <h2 id="attn-h" className="home-section-title">{tr("Needs attention")}</h2>
          <ul className="list-card attention-list">
            {overdue.slice(0, 3).map((r) => (
              <li key={r.id}>
                <Link href={`/tools/invoices/reminders?id=${r.id}`} className="list-row">
                  <span className="app-icon red"><BellRing size={17} aria-hidden="true" /></span>
                  <span className="list-text"><strong>{tr("Remind")} {r.customer?.name || tr("customer")}</strong><span>{rupees(Math.max(0, r.total - r.amount_paid))} · {tr("due")} {shortDate(r.due_date as string)}</span></span>
                  <ChevronRight size={17} className="list-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ask-card" aria-labelledby="ask-title">
        <h2 id="ask-title" className="home-section-title">{tr("Draft with AI")}</h2>
        <PromptBox heading={tr("Describe an agreement and GeniusAI drafts it")} compact />
      </section>

      <h2 className="dash-section-title">{tr("Continue where you left off")}</h2>
      <div className="continue-grid">
        <section className="panel-card" aria-labelledby="recent-agreements">
          <div className="panel-title"><div><h3 id="recent-agreements">{tr("Agreements")}</h3></div><Link href="/tools/agreements">{tr("See all")}</Link></div>
          {agreements.length === 0 ? (
            <p className="dash-empty">{tr("No agreements yet.")} <Link href="/tools/agreements">{tr("Draft your first one")}</Link></p>
          ) : (
            <ul className="mini-list">
              {agreements.map((a) => (
                <li key={a.id}>
                  <Link href={`/tools/agreements/${a.id}`}>
                    <span className="mini-title">{a.title}</span>
                    <span className="mini-meta">{getTemplate(a.template_key)?.title ?? tr("Custom document")}, {shortDate(a.updated_at)}</span>
                  </Link>
                  <span className={`as-status ${a.status}`}>{tr(a.status === "final" ? "Final" : "Draft")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel-card" aria-labelledby="recent-files">
          <div className="panel-title"><div><h3 id="recent-files">{tr("Files")}</h3></div><Link href="/files">{tr("See all")}</Link></div>
          <RecentFiles files={ctx.recentFiles.slice(0, 4)} currentUserId={ctx.user.id} role={workspace.role} />
        </section>
        <section className="panel-card credits-card" aria-labelledby="credits-h">
          <div className="panel-title"><div><h3 id="credits-h">{tr("Credits")}</h3></div><Link href="/billing">{tr("Buy credits")}</Link></div>
          <p className="credits-big">{credits.available.toLocaleString("en-IN")}</p>
          <p className="dash-empty">{tr("available for AI tools")}{credits.reserved > 0 ? `, ${credits.reserved.toLocaleString("en-IN")} ${tr("in use now")}` : ""}. {tr("PDF tools and signing are free.")}</p>
          <p className="dash-fine">{tr("A typical agreement draft uses 10–25 credits.")}</p>
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

      <footer>{tr("Files are stored privately in")} {workspace.name}. {tr("AI tools send a file to the AI provider only when you run a task on it.")}</footer>
    </AppShell>
  );
}
