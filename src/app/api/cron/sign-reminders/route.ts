import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/email/send";
import { type RequestRow, type SignerRow } from "@/lib/sign-requests/server";
import { AUTO_REMIND_EVERY_DAYS, AUTO_REMIND_MAX, reminderLog, sendReminders, signersDue } from "@/lib/sign-requests/remind";

// Daily job (Vercel Cron, see vercel.json): closes expired signing requests and emails automatic
// reminders — every 3 days, at most 3 times per signer. Only runs with the CRON_SECRET header.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const want = Buffer.from(`Bearer ${secret}`), have = Buffer.from(got);
  return want.length === have.length && timingSafeEqual(want, have);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // 1. Close requests whose links have run out.
  const { data: expired } = await admin.from("signature_requests").update({ status: "expired" }).eq("status", "pending").lt("expires_at", now).select("id");

  // 2. Reminders.
  if (!emailConfigured()) return NextResponse.json({ expired: expired?.length ?? 0, reminded: 0, note: "email not configured" });
  const olderThan = new Date(Date.now() - AUTO_REMIND_EVERY_DAYS * 86_400_000);
  const { data: reqs } = await admin.from("signature_requests").select("*").eq("status", "pending").gt("expires_at", now)
    .lt("created_at", olderThan.toISOString()).order("created_at").limit(200);
  const requests = (reqs ?? []) as RequestRow[];
  if (!requests.length) return NextResponse.json({ expired: expired?.length ?? 0, reminded: 0 });
  const ids = requests.map((r) => r.id);
  const [{ data: sData }, log] = await Promise.all([admin.from("signature_signers").select("*").in("request_id", ids), reminderLog(admin, ids)]);
  const byReq = new Map<string, SignerRow[]>();
  for (const s of (sData ?? []) as SignerRow[]) byReq.set(s.request_id, [...(byReq.get(s.request_id) ?? []), s]);
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const origin = prod ? `https://${prod.replace(/^https?:\/\//, "")}` : request.nextUrl.origin;
  let reminded = 0;
  for (const req of requests) {
    const targets = signersDue(req, byReq.get(req.id) ?? []).filter((s) => {
      const l = log.get(s.id);
      return (l?.count ?? 0) < AUTO_REMIND_MAX && Date.now() - (l?.last ?? 0) >= AUTO_REMIND_EVERY_DAYS * 86_400_000 - 3_600_000;
    });
    if (targets.length) reminded += (await sendReminders(admin, origin, req, targets, log)).sent.length;
  }
  return NextResponse.json({ expired: expired?.length ?? 0, reminded });
}
