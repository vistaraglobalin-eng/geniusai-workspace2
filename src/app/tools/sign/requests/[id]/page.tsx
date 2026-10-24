import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { statusLabel } from "@/lib/sign-requests/status";
import { SIGNER_COLORS } from "../ShareLinks";
import { RequestActions } from "./RequestActions";

export const metadata: Metadata = { title: "Signature request · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT: Record<string, string> = {
  created: "Request created", viewed: "Opened the document", signed: "Signed", declined: "Declined", completed: "Signed PDF produced", cancelled: "Request cancelled", link_copied: "Link copied", reminded: "Reminder emailed", reassigned: "Signer changed (new link)"
};
const when = (iso: string | null) => iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=/tools/sign/requests/${id}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const { data: reqData } = await supabase.from("signature_requests")
    .select("id, title, document_name, sender_name, message, status, signing_order, expires_at, created_at, completed_at, completed_file_id, completed_object_key, source_object_key").eq("id", id).maybeSingle();
  if (!reqData) notFound();
  const r = reqData as { id: string; title: string; document_name: string; sender_name: string; message: string | null; status: string; signing_order: string;
    expires_at: string; created_at: string; completed_at: string | null; completed_file_id: string | null; completed_object_key: string | null; source_object_key: string };
  const { data: sData } = await supabase.from("signature_signers")
    .select("id, position, name, email, status, viewed_at, signed_at, declined_at, decline_reason, fields").eq("request_id", id).order("position");
  const signers = (sData ?? []) as { id: string; position: number; name: string; email: string | null; status: string; viewed_at: string | null; signed_at: string | null;
    declined_at: string | null; decline_reason: string | null; fields: unknown[] }[];
  const { data: eData } = await supabase.from("signature_events").select("id, event, signer_id, created_at").eq("request_id", id).order("created_at");
  const events = (eData ?? []) as { id: string; event: string; signer_id: string | null; created_at: string }[];

  const signed = signers.filter((s) => s.status === "signed").length;
  const st = statusLabel(r, signed, signers.length);
  const nameOf = (sid: string | null) => signers.find((s) => s.id === sid)?.name;

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="sign" breadcrumb="Signature request">
      <Link href="/tools/sign/requests" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Signature requests</Link>
      <div className="welcome-row">
        <div>
          <h1>{r.title}</h1>
          <p className="subtitle">{r.document_name} · sent {when(r.created_at)}{r.status === "pending" ? ` · links work until ${when(r.expires_at)}` : ""}{r.signing_order === "sequential" ? " · signed one after another" : ""}</p>
        </div>
        <span className={`as-status ${st.tone}`}>{st.text}</span>
      </div>

      {r.status === "completed" && (
        <p className="form-message success">Everyone has signed. The signed PDF, with a signing certificate on the last page, is saved in your Files.</p>
      )}

      <div className="sr-detail">
        <section className="panel-card">
          <h2 className="dash-section-title">Signers</h2>
          <ul className="sr-signers">
            {signers.map((s) => (
              <li key={s.id}>
                <span className="sr-dot" style={{ background: SIGNER_COLORS[(s.position - 1) % SIGNER_COLORS.length] }} aria-hidden="true">{s.position}</span>
                <span className="list-text">
                  <strong>{s.name}</strong>
                  <span>
                    {s.status === "signed" ? `Signed ${when(s.signed_at)}` : s.status === "declined" ? `Declined ${when(s.declined_at)}${s.decline_reason ? `: “${s.decline_reason}”` : ""}` : s.status === "viewed" ? `Opened ${when(s.viewed_at)}, not signed yet` : "Not opened yet"}
                    {s.email ? ` · ${s.email}` : ""}
                  </span>
                </span>
                <span className={`as-status ${s.status === "signed" ? "final" : s.status === "declined" ? "bad" : ""}`}>{s.status === "signed" ? "Signed" : s.status === "declined" ? "Declined" : "Waiting"}</span>
              </li>
            ))}
          </ul>
          {r.message && <p className="sr-message">“{r.message}”</p>}
        </section>

        <RequestActions id={r.id} status={r.status} completedKey={r.completed_object_key} sourceKey={r.source_object_key} documentName={r.document_name} allSigned={signed === signers.length && signers.length > 0} title={r.document_name.replace(/\.pdf$/i, "")} sender={r.sender_name} canEdit={workspace.access !== "view"} />

        <section className="panel-card">
          <h2 className="dash-section-title">Activity</h2>
          <ol className="sr-timeline">
            {events.map((e) => (
              <li key={e.id}><span>{EVENT[e.event] ?? e.event}{nameOf(e.signer_id) ? ` · ${nameOf(e.signer_id)}` : ""}</span><time dateTime={e.created_at}>{when(e.created_at)}</time></li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
