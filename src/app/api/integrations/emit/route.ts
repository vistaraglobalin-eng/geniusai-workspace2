import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emitExpense, emitFile, emitInvoice } from "@/lib/integrations/emit";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
const TABLE = { invoice: "invoices", expense: "expenses", file: "files" } as const;

/** Called by the app after you save something; announces it to your workspace's connections. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const kind = body.kind === "invoice" || body.kind === "expense" || body.kind === "file" ? body.kind : null;
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!kind || !id) return fail(400, "bad_request", "Invalid request.");
  // You can only announce things you can see (row-level security).
  const { data } = await supabase.from(TABLE[kind]).select("id").eq("id", id).maybeSingle();
  if (!data) return fail(404, "not_found", "Not found.");
  const admin = createSupabaseAdminClient(), origin = request.nextUrl.origin;
  if (kind === "invoice") await emitInvoice(admin, id, origin);
  else if (kind === "expense") await emitExpense(admin, id, origin);
  else await emitFile(admin, id, origin);
  return NextResponse.json({ ok: true });
}
