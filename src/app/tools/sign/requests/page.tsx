import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, FileSignature, Plus, XCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { ListRow } from "@/components/ListRow";
import { statusLabel } from "@/lib/sign-requests/status";

export const metadata: Metadata = { title: "Signature requests · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

type Req = { id: string; title: string; document_name: string; status: string; expires_at: string; created_at: string;
  signature_signers: { status: string }[] };

export default async function RequestsPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/sign/requests");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data, error } = await supabase.from("signature_requests")
    .select("id, title, document_name, status, expires_at, created_at, signature_signers(status)")
    .eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(100);
  const setupNeeded = !!error && /does not exist|schema cache/i.test(error.message);
  const rows = (data ?? []) as Req[];
  const date = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="sign" breadcrumb="Signature requests">
      <div className="welcome-row">
        <div>
          <h1>Signature requests</h1>
          <p className="subtitle">Send PDFs for others to sign and see who has signed.</p>
        </div>
        <Link className="primary-button" href="/tools/sign/requests/new"><Plus size={16} aria-hidden="true" /> New request</Link>
      </div>
      {setupNeeded ? (
        <section className="panel-card"><p className="form-message error">Request signatures needs a one-time database update before it can be used.</p></section>
      ) : rows.length === 0 ? (
        <section className="panel-card empty-state">
          <div className="empty-icon"><FileSignature size={22} aria-hidden="true" /></div>
          <p>No requests yet. Send a contract, offer letter or agreement for signing.</p>
          <Link className="primary-button" href="/tools/sign/requests/new">Request signatures</Link>
        </section>
      ) : (
        <ul className="list-card">
          {rows.map((r) => {
            const total = r.signature_signers.length, signed = r.signature_signers.filter((s) => s.status === "signed").length;
            const st = statusLabel(r, signed, total);
            const Icon = st.text === "Completed" ? CheckCircle2 : st.tone === "bad" || st.tone === "muted" ? XCircle : Clock;
            const tint = st.text === "Completed" ? "green" : st.tone === "bad" ? "red" : st.tone === "muted" ? "gray" : "orange";
            return (
              <ListRow key={r.id} href={`/tools/sign/requests/${r.id}`} tint={tint} icon={<Icon size={17} aria-hidden="true" />}
                title={r.title} text={`${r.document_name} · sent ${date(r.created_at)}`}
                badge={<span className={`as-status ${st.tone}`}>{st.text}</span>} />
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
