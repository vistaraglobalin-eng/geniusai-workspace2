import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightLeft, Bell, BriefcaseBusiness, Check, ChevronDown, CircleUserRound, Contact, Eye, FilePen, FileStack, FileText, FolderOpen, Home, Image as ImageIcon, IndianRupee, LayoutTemplate, LogOut, Mail, MessageSquareText, PenLine, Plus, ReceiptText, ScanLine, Settings, Signature, Sparkles, Users, Wallet, Zap, GitCompareArrows, Landmark, BookCheck, Diff, Network, BookOpen, GraduationCap, FileSpreadsheet, ScrollText } from "lucide-react";
import type { WorkspaceContext } from "@/lib/workspace";
import { roleLabel } from "@/lib/team/roles";
import type { Lang } from "@/lib/i18n";
import { getLang, t } from "@/lib/i18n-server";
import { LanguageSwitch } from "@/components/LanguageSwitch";


export type NavKey =
  | "overview" | "money" | "docs" | "create" | "account"
  | "invoices" | "expenses" | "tally" | "scan" | "chat" | "pdf" | "edit" | "sign" | "agreements" | "documents" | "letters"
  | "creative" | "cards" | "career" | "templates" | "files" | "tools" | "billing" | "settings"
  | "conflicts" | "law-impact" | "playbook" | "compare" | "clause-map" | "read" | "study" | "statement" | "exam" | "policies";

type NavItem = { key: NavKey; href: string; label: string; Icon: typeof Home; tint: string };
type NavGroup = { title: string; hub: string; area: NavKey; items: NavItem[] };

/** The five areas. Sidebar (desktop) shows the groups; the phone tab bar shows one tab per area. */
const GROUPS: NavGroup[] = [
  { title: "Money", hub: "/money", area: "money", items: [
    { key: "invoices", href: "/tools/invoices", label: "Invoices", Icon: ReceiptText, tint: "green" },
    { key: "expenses", href: "/tools/expenses", label: "Expenses", Icon: Wallet, tint: "teal" },
    { key: "tally", href: "/tools/tally", label: "Export to Tally", Icon: ArrowRightLeft, tint: "teal" },
    { key: "statement", href: "/tools/statement", label: "Statement to Excel", Icon: FileSpreadsheet, tint: "green" }
  ] },
  { title: "Documents", hub: "/docs", area: "docs", items: [
    { key: "scan", href: "/tools/scan", label: "Scan & convert", Icon: ScanLine, tint: "red" },
    { key: "pdf", href: "/tools/pdf", label: "PDF tools", Icon: FileStack, tint: "red" },
    { key: "edit", href: "/tools/edit", label: "Edit PDF", Icon: PenLine, tint: "blue" },
    { key: "sign", href: "/tools/sign", label: "Sign & send", Icon: Signature, tint: "indigo" },
    { key: "agreements", href: "/tools/agreements", label: "Agreements", Icon: FilePen, tint: "purple" },
    { key: "chat", href: "/tools/chat", label: "Chat with a doc", Icon: MessageSquareText, tint: "cyan" },
    { key: "documents", href: "/tools/documents", label: "AI documents", Icon: Sparkles, tint: "cyan" },
    { key: "study", href: "/tools/study", label: "Quizzes & flashcards", Icon: GraduationCap, tint: "purple" },
    { key: "exam", href: "/tools/exam", label: "Question papers", Icon: ScrollText, tint: "purple" },
    { key: "policies", href: "/tools/policies", label: "Policy Q&A", Icon: BookCheck, tint: "cyan" },
    { key: "letters", href: "/tools/letters", label: "Letters", Icon: Mail, tint: "blue" },
    { key: "templates", href: "/templates", label: "Templates", Icon: LayoutTemplate, tint: "blue" }
  ] },
  { title: "Contract review", hub: "/tools/agreements#review", area: "docs", items: [
    { key: "conflicts", href: "/tools/agreements/conflicts", label: "Find conflicts", Icon: GitCompareArrows, tint: "orange" },
    { key: "law-impact", href: "/tools/agreements/law-impact", label: "New-law check", Icon: Landmark, tint: "orange" },
    { key: "playbook", href: "/tools/agreements/playbook", label: "Firm playbook", Icon: BookCheck, tint: "orange" },
    { key: "compare", href: "/tools/compare", label: "Compare versions", Icon: Diff, tint: "orange" },
    { key: "clause-map", href: "/tools/agreements/clause-map", label: "Clause map", Icon: Network, tint: "orange" },
    { key: "read", href: "/tools/read", label: "Read mode", Icon: BookOpen, tint: "teal" }
  ] },
  { title: "Create", hub: "/create", area: "create", items: [
    { key: "creative", href: "/tools/photos", label: "Photos & Ads", Icon: ImageIcon, tint: "orange" },
    { key: "cards", href: "/tools/cards", label: "Cards & letterhead", Icon: Contact, tint: "orange" },
    { key: "career", href: "/tools/career", label: "Resumes", Icon: BriefcaseBusiness, tint: "purple" }
  ] }
];
const ACCOUNT: NavItem[] = [
  { key: "files", href: "/files", label: "Files", Icon: FolderOpen, tint: "cyan" },
  { key: "billing", href: "/billing", label: "Plans & credits", Icon: Zap, tint: "green" },
  { key: "settings", href: "/settings", label: "Settings", Icon: Settings, tint: "gray" }
];

/** Phone tab bar: one tab per area. */
const TABS: { href: string; label: string; Icon: typeof Home; covers: NavKey[] }[] = [
  { href: "/", label: "Home", Icon: Home, covers: ["overview"] },
  { href: "/money", label: "Money", Icon: IndianRupee, covers: ["money", "invoices", "expenses", "tally", "statement"] },
  { href: "/docs", label: "Documents", Icon: FileText, covers: ["docs", "scan", "chat", "pdf", "edit", "sign", "agreements", "documents", "letters", "templates", "conflicts", "law-impact", "playbook", "compare", "clause-map", "read", "study", "exam", "policies"] },
  { href: "/create", label: "Create", Icon: Sparkles, covers: ["create", "creative", "cards", "career"] },
  { href: "/account", label: "Account", Icon: CircleUserRound, covers: ["account", "files", "tools", "billing", "settings"] }
];

/** The "+ New" menu: the most common things to start. */
const NEW_ITEMS = [
  { href: "/tools/invoices/new?kind=invoice", label: "New invoice", Icon: ReceiptText, tint: "green" },
  { href: "/tools/expenses", label: "Add expense", Icon: Wallet, tint: "teal" },
  { href: "/tools/scan", label: "Scan or convert", Icon: ScanLine, tint: "red" },
  { href: "/tools/sign", label: "Sign a PDF", Icon: Signature, tint: "indigo" },
  { href: "/tools/letters", label: "Write a letter", Icon: Mail, tint: "blue" },
  { href: "/tools/documents?task=summary", label: "Summarize a document", Icon: Sparkles, tint: "cyan" }
] as const;

const navLink = (item: NavItem, active: NavKey, lang: Lang) => (
  <Link key={item.key} className="nav-item" href={item.href} title={t(lang, item.label)} aria-current={active === item.key ? "page" : undefined}>
    <span className={`app-icon sm ${item.tint}`}><item.Icon size={15} aria-hidden="true" /></span><span className="nav-label">{t(lang, item.label)}</span>
  </Link>
);

/**
 * Frame for every signed-in page.
 * Desktop: full sidebar · Tablet: icon rail · Phone: bottom tab bar (see globals.css).
 */
export async function AppShell({
  ctx,
  active,
  breadcrumb,
  children
}: {
  ctx: WorkspaceContext & { workspace: NonNullable<WorkspaceContext["workspace"]> };
  active: NavKey;
  breadcrumb: string;
  children: ReactNode;
}) {
  const { workspace, user } = ctx;
  const name = ctx.displayName?.trim() || user.email?.split("@")[0] || "there";
  const initial = (name[0] ?? "G").toUpperCase();
  const lang = await getLang();
  const tr = (s: string) => t(lang, s);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">{tr("Skip to content")}</a>

      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="GeniusAI Workspace home">
          <span className="brand-mark"><Sparkles size={20} aria-hidden="true" /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </Link>
        <details className="new-menu">
          <summary><span className="plus"><Plus size={17} aria-hidden="true" /></span><span className="nav-label">{tr("New")}</span></summary>
          <div className="new-menu-list">
            {NEW_ITEMS.map(({ href, label, Icon, tint }) => (
              <Link key={label} href={href}><span className={`app-icon sm ${tint}`}><Icon size={15} aria-hidden="true" /></span>{tr(label)}</Link>
            ))}
          </div>
        </details>
        <nav aria-label={tr("Main")}>
          <Link className="nav-item" href="/" title={tr("Home")} aria-current={active === "overview" ? "page" : undefined}>
            <span className="app-icon sm gray"><Home size={15} aria-hidden="true" /></span><span className="nav-label">{tr("Home")}</span>
          </Link>
          {GROUPS.map((g) => (
            <div key={g.title} role="group" aria-label={tr(g.title)}>
              <div className="nav-group"><span>{tr(g.title)}</span><Link href={g.hub}>{tr("All")}</Link></div>
              {g.items.map((i) => navLink(i, active, lang))}
            </div>
          ))}
          <div className="nav-group"><span>{tr("Account")}</span><Link href="/account">{tr("All")}</Link></div>
          {ACCOUNT.map((i) => navLink(i, active, lang))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar" aria-hidden="true">{initial}</div>
            <div className="profile-text"><strong title={name}>{name}</strong><span title={workspace.name}>{workspace.name} · {roleLabel(workspace.role, workspace.access)}</span></div>
            <form action="/auth/signout" method="post" className="signout-form">
              <button type="submit" className="icon-button" aria-label={tr("Sign out of this device")} title={tr("Sign out")}><LogOut size={16} aria-hidden="true" /></button>
            </form>
          </div>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            {ctx.workspaces.length > 1 ? (
              <details className="ws-switch">
                <summary aria-label={tr("Switch workspace")}>{workspace.name}<ChevronDown size={14} aria-hidden="true" /></summary>
                <div className="ws-menu" role="menu">
                  <span className="ws-menu-label">{tr("Your workspaces")}</span>
                  {ctx.workspaces.map((w) => (
                    <form key={w.id} action="/api/workspace/switch" method="post">
                      <input type="hidden" name="workspaceId" value={w.id} />
                      <button type="submit" role="menuitem" className={w.id === workspace.id ? "current" : ""} aria-current={w.id === workspace.id ? "true" : undefined}>
                        <span className="ws-initial" aria-hidden="true">{(w.name[0] ?? "W").toUpperCase()}</span>
                        <span className="ws-name"><strong>{w.name}</strong><span>{roleLabel(w.role, w.access)}</span></span>
                        {w.id === workspace.id && <Check size={15} aria-hidden="true" />}
                      </button>
                    </form>
                  ))}
                  <Link href="/settings/team" className="ws-menu-link"><Users size={15} aria-hidden="true" /> {tr("Team members")}</Link>
                </div>
              </details>
            ) : workspace.name}
            <span aria-hidden="true">/</span> {tr(breadcrumb)}
          </div>
          <div className="top-actions">
            <span className="topbar-email">{user.email}</span>
            <LanguageSwitch lang={lang} />
            <Link className="icon-button inbox-bell" href="/inbox" aria-label={ctx.unread ? (lang === "en" ? `Inbox, ${ctx.unread} unread` : `${tr("Inbox")} (${ctx.unread})`) : tr("Inbox")} title={tr("Inbox")}>
              <Bell size={18} aria-hidden="true" />{ctx.unread > 0 && <span className="bell-badge">{ctx.unread > 9 ? "9+" : ctx.unread}</span>}
            </Link>
            <Link className="avatar small" href="/settings#profile" aria-label={tr("Your profile and settings")}>{initial}</Link>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {workspace.access === "view" && <p className="form-message inline view-only-note"><Eye size={16} aria-hidden="true" /> You have view-only access to {workspace.name}. Ask an admin if you need to make changes.</p>}
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label={tr("Main")}>
        {TABS.map(({ href, label, Icon, covers }) => (
          <Link key={href} href={href} aria-label={tr(label)} aria-current={covers.includes(active) ? "page" : undefined}>
            <Icon size={22} strokeWidth={covers.includes(active) ? 2.1 : 1.7} aria-hidden="true" /><span className="tab-label">{tr(label)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function firstNameOf(ctx: WorkspaceContext): string {
  const name = ctx.displayName?.trim() || ctx.user.email?.split("@")[0] || "there";
  return name.split(/\s+/)[0];
}
