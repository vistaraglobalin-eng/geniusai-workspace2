import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/email/send";
import { isExpired, type RequestRow, type SignerRow } from "@/lib/sign-requests/server";
import { canEditWorkspace } from "@/lib/sign-requests/create";
import { reminderLog, sendReminders, signersDue } from "@/lib/sign-requests/remind";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Emails a reminder to one signer (signerId) or to everyone who still needs to sign. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { /* empty body = everyone */ }
  const signerId = typeof body.signerId === "string" && UUID.test(body.signerId) ? body.signerId : null;

  const { data: visible } = await supabase.from("signature_requests").select("id, workspace_id").eq("id", id).maybeSingle();
  if (!visible) return fail(404, "not_found", "That request wasn't found.");
  if (!(await canEditWorkspace(supabase, (visible as { workspace_id: string }).workspace_id, user.id))) return fail(403, "view_only", "You have view-only access, so you can't send reminders.");
  if (!emailConfigured()) return fail(503, "email_off", "Email isn't set up yet. Send the reminder by WhatsApp or SMS instead.");

  const admin = createSupabaseAdminClient();
  const { data: reqRow } = await admin.from("signature_requests").select("*").eq("id", id).single();
  const req = reqRow as RequestRow;
  if (req.status !== "pending") return fail(409, "closed", "This request is already finished, declined or cancelled.");
  if (isExpired(req)) return fail(409, "expired", "The signing links have expired. Create a new request.");
  const { data: sData } = await admin.from("signature_signers").select("*").eq("request_id", id).order("position");
  const due = signersDue(req, (sData ?? []) as SignerRow[]);
  const targets = signerId ? due.filter((s) => s.id === signerId) : due;
  if (signerId && !targets.length) return fail(409, "not_due", "This person has already signed, or it isn't their turn yet.");
  const r = await sendReminders(admin, request.nextUrl.origin, req, targets, await reminderLog(admin, [id]));
  const parts = [
    r.sent.length ? `Reminder emailed to ${r.sent.join(", ")}.` : "",
    r.recent.length ? `${r.recent.join(", ")} ${r.recent.length === 1 ? "was" : "were"} reminded in the last day, so we waited.` : "",
    r.noEmail.length ? `No email for ${r.noEmail.join(", ")} — send their link by WhatsApp.` : ""
  ].filter(Boolean);
  return NextResponse.json({ ...r, message: parts.join(" ") || "Nobody needed a reminder." });
}
