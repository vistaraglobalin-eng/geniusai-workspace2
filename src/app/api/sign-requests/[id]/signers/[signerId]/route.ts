import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientMeta, isExpired, logEvent, newAccessToken, signingLink, type RequestRow, type SignerRow } from "@/lib/sign-requests/server";
import { EMAIL_RE, canEditWorkspace, cleanText } from "@/lib/sign-requests/create";
import { emailInvite } from "@/lib/sign-requests/emails";
import { signersDue } from "@/lib/sign-requests/remind";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/**
 * Change who signs (or fix their email) before they have signed.
 * The old link stops working and the new person gets a fresh private link.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; signerId: string }> }) {
  const { id, signerId } = await params;
  if (!UUID.test(id) || !UUID.test(signerId)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const name = cleanText(body.name, 120), email = cleanText(body.email, 254).toLowerCase();
  if (name.length < 2) return fail(422, "name_required", "Enter the signer's full name.");
  if (email && !EMAIL_RE.test(email)) return fail(422, "bad_email", "That email doesn't look right.");

  const { data: visible } = await supabase.from("signature_requests").select("id, workspace_id").eq("id", id).maybeSingle();
  if (!visible) return fail(404, "not_found", "That request wasn't found.");
  const workspaceId = (visible as { workspace_id: string }).workspace_id;
  if (!(await canEditWorkspace(supabase, workspaceId, user.id))) return fail(403, "view_only", "You have view-only access, so you can't change signers.");

  const admin = createSupabaseAdminClient();
  const { data: reqRow } = await admin.from("signature_requests").select("*").eq("id", id).single();
  const req = reqRow as RequestRow;
  if (req.status !== "pending") return fail(409, "closed", "This request is already finished, declined or cancelled.");
  if (isExpired(req)) return fail(409, "expired", "The signing links have expired. Create a new request.");

  const token = newAccessToken();
  const { data: updated } = await admin.from("signature_signers")
    .update({ name, email: email || null, access_token: token, status: "pending", viewed_at: null, ip: null, user_agent: null })
    .eq("id", signerId).eq("request_id", id).in("status", ["pending", "viewed"]).select("*").maybeSingle();
  if (!updated) return fail(409, "already_signed", "This person has already signed or declined, so they can't be changed.");
  const signer = updated as SignerRow;
  const { ip, ua } = clientMeta(request);
  await logEvent(admin, { requestId: id, workspaceId, signerId, event: "reassigned", ip, ua });

  const { data: all } = await admin.from("signature_signers").select("*").eq("request_id", id).order("position");
  const due = signersDue(req, (all ?? []) as SignerRow[]).some((s) => s.id === signerId);
  const emailed = due && email ? await emailInvite(admin, request.nextUrl.origin, req, { name, email, access_token: token }) : false;
  return NextResponse.json({ link: { id: signer.id, position: signer.position, name, email: email || null, status: "pending", url: signingLink(request, token), emailed } });
}
