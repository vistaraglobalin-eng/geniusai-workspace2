import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { FILES_BUCKET } from "@/lib/storage/files";
import { saveFileForUser } from "@/lib/storage/server-save";
import { buildCompletedPdf, type CompletedSigner, type SignField } from "@/lib/pdf/sign-request";

export const newAccessToken = () => randomBytes(32).toString("base64url"); // 43 chars, 256 bits
export const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;

export function clientMeta(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  const ua = request.headers.get("user-agent")?.slice(0, 400) ?? null;
  return { ip, ua };
}

export function signingLink(request: NextRequest, token: string) {
  return `${request.nextUrl.origin}/s/${token}`;
}

export type RequestRow = {
  id: string; workspace_id: string; created_by: string | null; sender_name: string; source_object_key: string;
  document_name: string; original_sha256: string; page_count: number; title: string; message: string | null;
  signing_order: "any" | "sequential"; status: string; completed_file_id: string | null; completed_object_key: string | null;
  expires_at: string; completed_at: string | null; created_at: string;
};
export type SignerRow = {
  id: string; request_id: string; workspace_id: string; position: number; name: string; email: string | null; access_token: string;
  fields: SignField[]; status: "pending" | "viewed" | "signed" | "declined"; typed_name: string | null; signature_png: string | null;
  name_png: string | null; viewed_at: string | null; signed_at: string | null; declined_at: string | null; ip: string | null; user_agent: string | null;
};

export const isExpired = (r: Pick<RequestRow, "expires_at">) => new Date(r.expires_at).getTime() < Date.now();

/** Finds a signer and their request from a signing link. Service role only. */
export async function loadByToken(admin: SupabaseClient, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const { data: signer } = await admin.from("signature_signers").select("*").eq("access_token", token).maybeSingle();
  if (!signer) return null;
  const { data: req } = await admin.from("signature_requests").select("*").eq("id", (signer as SignerRow).request_id).maybeSingle();
  if (!req) return null;
  const { data: all } = await admin.from("signature_signers")
    .select("id, position, name, status, signed_at").eq("request_id", (req as RequestRow).id).order("position");
  return {
    signer: signer as SignerRow,
    request: req as RequestRow,
    signers: (all ?? []) as Pick<SignerRow, "id" | "position" | "name" | "status" | "signed_at">[]
  };
}

export async function logEvent(admin: SupabaseClient, e: { requestId: string; workspaceId: string; signerId?: string | null; event: string; ip?: string | null; ua?: string | null }) {
  await admin.from("signature_events").insert({
    request_id: e.requestId, workspace_id: e.workspaceId, signer_id: e.signerId ?? null, event: e.event, ip: e.ip ?? null, user_agent: e.ua ?? null
  });
}

const pngBytes = (dataUrl: string | null) => (dataUrl ? new Uint8Array(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")) : null);

/**
 * When every signer has signed: builds the final PDF (all signatures + certificate) and saves it
 * to the sender's Files. Safe to call more than once; only one caller wins the "finalizing" claim.
 */
export async function finalizeIfComplete(admin: SupabaseClient, requestId: string): Promise<"completed" | "waiting" | "busy" | "failed"> {
  const { data: signersData } = await admin.from("signature_signers").select("*").eq("request_id", requestId).order("position");
  const signers = (signersData ?? []) as SignerRow[];
  if (signers.length === 0 || signers.some((s) => s.status !== "signed")) return "waiting";

  // Claim the work (pending -> finalizing, or retry a finalizing claim older than 3 minutes).
  const staleBefore = new Date(Date.now() - 3 * 60_000).toISOString();
  let { data: claimed } = await admin.from("signature_requests").update({ status: "finalizing" })
    .eq("id", requestId).eq("status", "pending").select("*").maybeSingle();
  if (!claimed) {
    ({ data: claimed } = await admin.from("signature_requests").update({ status: "finalizing" })
      .eq("id", requestId).eq("status", "finalizing").lt("updated_at", staleBefore).select("*").maybeSingle());
  }
  if (!claimed) return "busy";
  const req = claimed as RequestRow;

  try {
    const { data: blob, error } = await admin.storage.from(FILES_BUCKET).download(req.source_object_key);
    if (error || !blob) throw new Error("original_missing");
    const original = new Uint8Array(await blob.arrayBuffer());
    let senderEmail: string | null = null;
    if (req.created_by) {
      const { data: u } = await admin.auth.admin.getUserById(req.created_by);
      senderEmail = u?.user?.email ?? null;
    }
    const completedAt = new Date();
    const completed: CompletedSigner[] = signers.map((s) => ({
      position: s.position, name: s.name, email: s.email, typedName: s.typed_name || s.name, fields: s.fields,
      signaturePng: pngBytes(s.signature_png)!, namePng: pngBytes(s.name_png),
      viewedAt: s.viewed_at ? new Date(s.viewed_at) : null, signedAt: new Date(s.signed_at!), ip: s.ip, userAgent: s.user_agent
    }));
    const bytes = await buildCompletedPdf(original, completed, {
      requestId: req.id, documentName: req.document_name, title: req.title, senderName: req.sender_name, senderEmail,
      createdAt: new Date(req.created_at), completedAt, originalSha256: req.original_sha256
    });
    const base = req.document_name.replace(/\.pdf$/i, "").slice(0, 200);
    const name = `${base} (signed by all).pdf`;
    let fileId: string | null = null, objectKey: string;
    if (req.created_by) {
      const saved = await saveFileForUser(admin, { workspaceId: req.workspace_id, userId: req.created_by, name, mime: "application/pdf", bytes, moduleKey: "contracts" });
      if ("error" in saved) throw new Error(saved.error);
      fileId = saved.id; objectKey = saved.objectKey;
    } else {
      objectKey = `${req.workspace_id}/signature-requests/${req.id}.pdf`;
      const { error: upErr } = await admin.storage.from(FILES_BUCKET).upload(objectKey, new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error("upload_failed");
    }
    await admin.from("signature_requests").update({
      status: "completed", completed_at: completedAt.toISOString(), completed_file_id: fileId, completed_object_key: objectKey,
      completed_sha256: createHash("sha256").update(bytes).digest("hex")
    }).eq("id", req.id);
    await logEvent(admin, { requestId: req.id, workspaceId: req.workspace_id, event: "completed" });
    await admin.from("audit_logs").insert({
      workspace_id: req.workspace_id, actor_user_id: req.created_by, action_key: "signature_request.completed", target_type: "signature_request", target_id: req.id,
      metadata: { file_id: fileId, signers: signers.map((s) => ({ name: s.name, signed_at: s.signed_at, ip: s.ip })) }
    });
    return "completed";
  } catch (err) {
    console.error("finalize", err);
    await admin.from("signature_requests").update({ status: "pending" }).eq("id", req.id).eq("status", "finalizing");
    return "failed";
  }
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadByToken>>>;

/** Why this signer can't sign right now, or null if they can. Shown to the signer as-is. */
export function signerBlock(ctx: Loaded): { code: string; message: string } | null {
  const { request: r, signer: s, signers } = ctx;
  if (s.status === "signed") return { code: "signed", message: "You've signed this document." };
  if (s.status === "declined") return { code: "declined", message: "You declined to sign this document." };
  if (r.status === "completed" || r.status === "finalizing") return { code: "completed", message: "Everyone has signed this document." };
  if (r.status === "cancelled") return { code: "cancelled", message: `${r.sender_name} cancelled this signing request.` };
  if (r.status === "declined") return { code: "request_declined", message: "Someone declined to sign, so this request was closed." };
  if (r.status === "expired" || isExpired(r)) return { code: "expired", message: `This signing link has expired. Ask ${r.sender_name} to send a new one.` };
  if (r.signing_order === "sequential") {
    const before = signers.filter((x) => x.position < s.position && x.status !== "signed");
    if (before.length) return { code: "waiting", message: `${before[0].name} needs to sign first. Open this link again after they have signed.` };
  }
  return null;
}
