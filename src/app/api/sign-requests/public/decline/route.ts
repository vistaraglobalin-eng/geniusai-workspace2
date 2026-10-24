import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientMeta, loadByToken, logEvent, signerBlock } from "@/lib/sign-requests/server";
import { fail } from "@/lib/agreements/server";
import { emailDeclined } from "@/lib/sign-requests/emails";

export const dynamic = "force-dynamic";

/** A signer declines. The request is closed and the sender sees the reason. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createSupabaseAdminClient();
  const ctx = typeof body.token === "string" ? await loadByToken(admin, body.token) : null;
  if (!ctx) return fail(404, "not_found", "This signing link isn't valid.");
  const block = signerBlock(ctx);
  if (block && block.code !== "waiting") return fail(409, block.code, block.message);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const { ip, ua } = clientMeta(request);
  const now = new Date().toISOString();
  const { data: updated } = await admin.from("signature_signers").update({ status: "declined", declined_at: now, decline_reason: reason || null, ip, user_agent: ua })
    .eq("id", ctx.signer.id).in("status", ["pending", "viewed"]).select("id").maybeSingle();
  if (!updated) return fail(409, "done", "This document can't be declined now.");
  await admin.from("signature_requests").update({ status: "declined" }).eq("id", ctx.request.id).eq("status", "pending");
  await logEvent(admin, { requestId: ctx.request.id, workspaceId: ctx.request.workspace_id, signerId: ctx.signer.id, event: "declined", ip, ua });
  await emailDeclined(admin, request.nextUrl.origin, ctx.request, ctx.signer.name, reason || null).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
