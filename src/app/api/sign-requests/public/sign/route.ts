import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PdfToolError } from "@/lib/pdf/tools";
import { REQUEST_LIMITS, decodePng } from "@/lib/pdf/sign-request";
import { SIGN_LIMITS } from "@/lib/pdf/sign";
import { clientMeta, finalizeIfComplete, loadByToken, logEvent, signerBlock } from "@/lib/sign-requests/server";
import { fail } from "@/lib/agreements/server";
import { emailCompleted, emailInvite } from "@/lib/sign-requests/emails";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** A signer applies their signature through their private link. No account needed. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createSupabaseAdminClient();
  const ctx = typeof body.token === "string" ? await loadByToken(admin, body.token) : null;
  if (!ctx) return fail(404, "not_found", "This signing link isn't valid.");
  const block = signerBlock(ctx);
  if (block) return fail(409, block.code, block.message);
  if (body.consent !== true) return fail(422, "consent_required", "Please agree to sign electronically.");
  const typedName = typeof body.typedName === "string" ? body.typedName.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (typedName.length < 2) return fail(422, "name_required", "Type your full name.");

  let signaturePng: string, namePng: string | null = null;
  try {
    decodePng(body.signature, SIGN_LIMITS.maxSignatureBytes, "Your signature");
    signaturePng = body.signature as string;
    if (body.namePng != null) { decodePng(body.namePng, REQUEST_LIMITS.maxNamePngBytes, "Your name"); namePng = body.namePng as string; }
  } catch (err) {
    return fail(422, "invalid", err instanceof PdfToolError ? err.message : "Your signature couldn't be read.");
  }

  const { ip, ua } = clientMeta(request);
  const now = new Date().toISOString();
  const { data: updated } = await admin.from("signature_signers").update({
    status: "signed", signed_at: now, typed_name: typedName, signature_png: signaturePng, name_png: namePng, ip, user_agent: ua,
    viewed_at: ctx.signer.viewed_at ?? now
  }).eq("id", ctx.signer.id).in("status", ["pending", "viewed"]).select("id").maybeSingle();
  if (!updated) return fail(409, "signed", "You've already signed this document.");
  await logEvent(admin, { requestId: ctx.request.id, workspaceId: ctx.request.workspace_id, signerId: ctx.signer.id, event: "signed", ip, ua });

  const result = await finalizeIfComplete(admin, ctx.request.id);
  try {
    const { data } = await admin.from("signature_signers").select("position, name, email, access_token, status").eq("request_id", ctx.request.id).order("position");
    const all = (data ?? []) as { position: number; name: string; email: string | null; access_token: string; status: string }[];
    const origin = request.nextUrl.origin;
    if (result === "completed") await emailCompleted(admin, origin, ctx.request, all);
    else if (ctx.request.signing_order === "sequential") {
      const next = all.find((s) => s.status !== "signed");
      if (next && next.status !== "declined") await emailInvite(admin, origin, ctx.request, next);
    }
  } catch (err) { console.error("sign emails", err); }
  return NextResponse.json({ ok: true, completed: result === "completed" });
}
