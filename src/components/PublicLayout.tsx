import Link from "next/link";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { SITE, isPlaceholder } from "@/lib/site";

export const PUBLIC_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/contact", label: "Contact" }
] as const;

/** Shows a business detail; unfilled [placeholders] are highlighted so they're noticed before launch. */
export function Detail({ value }: { value: string }) {
  return isPlaceholder(value) ? <mark className="placeholder" title="Fill this in: src/lib/site.ts">{value}</mark> : <>{value}</>;
}

export function PolicyLinks({ className = "policy-links" }: { className?: string }) {
  return (
    <nav className={className} aria-label="Policies">
      {PUBLIC_LINKS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
    </nav>
  );
}

/** Frame for public pages (no sign-in needed). */
export function PublicLayout({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="public-header">
        <Link className="brand" href="/" aria-label={`${SITE.productName}: home`}>
          <span className="brand-mark"><Sparkles size={20} aria-hidden="true" /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </Link>
        <nav className="public-nav" aria-label="Site">
          {PUBLIC_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <Link className="primary-button" href="/login">Sign in</Link>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} <Detail value={SITE.legalName} /> · {SITE.productName}</span>
        <PolicyLinks />
      </footer>
    </div>
  );
}
