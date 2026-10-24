import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadByToken, logEvent, signerBlock } from "@/lib/sign-requests/server";
import { SITE } from "@/lib/site";
import { SignerView } from "./SignerView";

export const metadata: Metadata = { title: "Sign a document · GeniusAI Workspace", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function SignLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const ctx = await loadByToken(admin, token).catch(() => null);

  let body;
  if (!ctx) {
    body = (
      <section className="panel-card sr-public-card">
        <h1>This signing link isn&apos;t valid</h1>
        <p>Check that you opened the complete link, or ask the sender to share it again.</p>
      </section>
    );
  } else {
    const block = signerBlock(ctx);
    // First open: record when the signer viewed the document (part of the signing certificate).
    if (!block && ctx.signer.status === "pending") {
      const now = new Date().toISOString();
      const { data: viewed } = await admin.from("signature_signers").update({ status: "viewed", viewed_at: now })
        .eq("id", ctx.signer.id).eq("status", "pending").select("id").maybeSingle();
      if (viewed) await logEvent(admin, { requestId: ctx.request.id, workspaceId: ctx.request.workspace_id, signerId: ctx.signer.id, event: "viewed" });
    }
    body = (
      <SignerView
        token={token}
        title={ctx.request.title}
        documentName={ctx.request.document_name}
        sender={ctx.request.sender_name}
        message={ctx.request.message}
        signerName={ctx.signer.name}
        fields={ctx.signer.fields}
        position={ctx.signer.position}
        total={ctx.signers.length}
        block={block}
        completed={ctx.request.status === "completed"}
      />
    );
  }

  return (
    <div className="public-shell">
      <header className="public-header sr-public-header">
        <Link className="brand" href="/" aria-label={`${SITE.productName}: home`}>
          <span className="brand-mark"><Sparkles size={20} aria-hidden="true" /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </Link>
        <span className="sr-secure"><ShieldCheck size={15} aria-hidden="true" /> Secure signing</span>
      </header>
      <main id="main" className="public-main sr-public-main">{body}</main>
    </div>
  );
}
