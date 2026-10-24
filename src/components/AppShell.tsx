import Link from "next/link";
import type { ReactNode } from "react";
import { FilePen, FileStack, FileText, FolderOpen, Home, LayoutGrid, LogOut, Settings, ShieldCheck, Sparkles, Zap, Image as ImageIcon, ReceiptText, BriefcaseBusiness } from "lucide-react";
import type { WorkspaceContext } from "@/lib/workspace";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export type NavKey = "overview" | "files" | "tools" | "pdf" | "documents" | "agreements" | "creative" | "invoices" | "career" | "billing" | "settings";

type NavItem = { key: NavKey; href: string; label: string; Icon: typeof Home; tint?: string };

/** Sidebar (desktop) and icon rail (tablet). */
const SIDEBAR_NAV: NavItem[] = [
  { key: "overview", href: "/", label: "Home", Icon: Home, tint: "blue" },
  { key: "files", href: "/files", label: "Files", Icon: FolderOpen, tint: "cyan" },
  { key: "pdf", href: "/tools/pdf", label: "PDF Toolkit", Icon: FileStack, tint: "red" },
  { key: "documents", href: "/tools/documents", label: "Document Genius", Icon: FileText, tint: "teal" },
  { key: "agreements", href: "/tools/agreements", label: "Agreement Studio", Icon: FilePen, tint: "indigo" },
  { key: "creative", href: "/tools/photos", label: "Photos & Ads", Icon: ImageIcon, tint: "orange" },
  { key: "invoices", href: "/tools/invoices", label: "Invoices", Icon: ReceiptText, tint: "green" },
  { key: "career", href: "/tools/career", label: "Resumes", Icon: BriefcaseBusiness, tint: "purple" }
];

/** Phone bottom bar: five thumb-sized targets. "Tools" covers every tool page. */
const BOTTOM_NAV: (NavItem & { short: string; covers: NavKey[] })[] = [
  { key: "overview", href: "/", label: "Home", short: "Home", Icon: Home, covers: ["overview"] },
  { key: "files", href: "/files", label: "Files", short: "Files", Icon: FolderOpen, covers: ["files"] },
  { key: "tools", href: "/tools", label: "All tools", short: "Tools", Icon: LayoutGrid, covers: ["tools", "pdf", "documents", "creative", "invoices", "career"] },
  { key: "agreements", href: "/tools/agreements", label: "Agreement Studio", short: "Agreements", Icon: FilePen, covers: ["agreements"] },
  { key: "settings", href: "/settings", label: "Settings", short: "Settings", Icon: Settings, covers: ["settings", "billing"] }
];

/**
 * Frame for every signed-in page.
 * Desktop: full sidebar · Tablet: icon rail · Phone: bottom tab bar (see globals.css).
 */
export function AppShell({
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="GeniusAI Workspace home">
          <span className="brand-mark"><Sparkles size={20} aria-hidden="true" /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </Link>
        <nav aria-label="Main">
          
          {SIDEBAR_NAV.map(({ key, href, label, Icon, tint }) => (
            <Link key={key} className="nav-item" href={href} title={label} aria-current={active === key ? "page" : undefined}>
              <span className={`app-icon sm ${tint ?? "gray"}`}><Icon size={15} aria-hidden="true" /></span><span className="nav-label">{label}</span>
            </Link>
          ))}
          <div className="nav-divider" />
          <Link className="nav-item" href="/billing" title="Plans & credits" aria-current={active === "billing" ? "page" : undefined}><span className="app-icon sm green"><Zap size={15} aria-hidden="true" /></span><span className="nav-label">Plans & credits</span></Link>
          <Link className="nav-item" href="/settings" title="Settings" aria-current={active === "settings" ? "page" : undefined}>
            <span className="app-icon sm gray"><Settings size={15} aria-hidden="true" /></span><span className="nav-label">Settings</span>
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={18} aria-hidden="true" /><div><strong>Privacy-first workspace</strong><span>Only your workspace can open your files.</span></div></div>
          <div className="profile">
            <div className="avatar" aria-hidden="true">{initial}</div>
            <div className="profile-text"><strong title={name}>{name}</strong><span title={workspace.name}>{workspace.name} · {ROLE_LABEL[workspace.role]}</span></div>
            <form action="/auth/signout" method="post" className="signout-form">
              <button type="submit" className="icon-button" aria-label="Sign out of this device" title="Sign out"><LogOut size={16} aria-hidden="true" /></button>
            </form>
          </div>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">{workspace.name} <span aria-hidden="true">/</span> {breadcrumb}</div>
          <div className="top-actions">
            <span className="topbar-email">{user.email}</span>
            <Link className="avatar small" href="/settings#profile" aria-label="Your profile and settings">{initial}</Link>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {BOTTOM_NAV.map(({ key, href, short, Icon, covers }) => (
          <Link key={key} href={href} aria-current={covers.includes(active) ? "page" : undefined}>
            <Icon size={20} aria-hidden="true" />{short}
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
