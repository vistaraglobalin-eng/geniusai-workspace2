import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, Building2, ChevronRight, DoorOpen, FilePenLine, Handshake, House, PenLine, ShieldCheck, TrendingUp, UserCheck, Wallet } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadInvoiceData } from "@/lib/invoices/server";
import { TEMPLATES, type TemplateKey } from "@/lib/letters/templates";

export const metadata: Metadata = { title: "Business letters · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

const ICONS: Record<TemplateKey, typeof Award> = {
  offer: Handshake, appointment: FilePenLine, experience: Award, relieving: DoorOpen, salary_slip: Wallet, increment: TrendingUp,
  noc: ShieldCheck, rent_receipt: House, authorization: UserCheck, custom: PenLine
};
const GROUPS = [
  { key: "Staff", title: "For your staff" },
  { key: "Business", title: "Business" },
  { key: "Personal", title: "Personal" }
] as const;

export default async function LettersPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/letters");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const { settings } = await loadInvoiceData(supabase, workspace.id);

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="letters" breadcrumb="Business letters">
      <div className="welcome-row">
        <div>
          <h1>Business letters</h1>
          <p className="subtitle">Offer letters, salary slips, experience certificates, rent receipts and more — on your letterhead, as PDF or Word. Free.</p>
        </div>
      </div>
      {!settings.business_name && (
        <Link href="/tools/invoices/settings" className="panel-card inv-setup">
          <span className="app-icon lg orange"><Building2 size={22} aria-hidden="true" /></span>
          <span><strong>Add your business details first</strong><span>Name, address, logo and signature make your letterhead. You set them once (shared with Invoices).</span></span>
        </Link>
      )}
      <div className="service-groups">
      {GROUPS.map((g) => (
        <section key={g.key} className="service-group" aria-labelledby={`g-${g.key}`}>
          <h2 id={`g-${g.key}`}>{g.title}</h2>
          <ul className="list-card">
            {TEMPLATES.filter((t) => t.category === g.key).map((t) => {
              const Icon = ICONS[t.key];
              return (
                <li key={t.key}>
                  <Link href={`/tools/letters/${t.key}`} className="list-row">
                    <span className={`app-icon ${t.color}`}><Icon size={17} aria-hidden="true" /></span>
                    <span className="list-text"><strong>{t.label}</strong><span>{t.note}</span></span>
                    <ChevronRight size={17} aria-hidden="true" className="list-chevron" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      </div>
    </AppShell>
  );
}
