import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { open } from "@/lib/integrations/crypto";
import { EVENT_KEYS } from "@/lib/integrations/events";
import { sendTest } from "@/lib/integrations/webhooks";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

async function guard(id: string) {
  if (!UUID.test(id)) return { error: fail(400, "bad_request", "Invalid request.") };
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  const ws = ctx.workspace;
  if (!ws || !((ws.role === "owner" || ws.role === "admin") && ws.access === "edit")) return { error: fail(403, "admins_only", "Only workspace owners and admins can change connections.") };
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("workspace_integrations").select("id, provider, url_enc").eq("id", id).eq("workspace_id", ws.id).maybeSingle();
  if (!data) return { error: fail(404, "not_found", "That connection wasn't found.") };
  return { admin, ws, hook: data as { id: string; provider: "slack" | "webhook"; url_enc: string } };
}

/** Change which events are sent. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const events = Array.isArray(body.events) ? body.events.filter((e): e is string => typeof e === "string" && EVENT_KEYS.includes(e)) : null;
  if (!events) return fail(400, "bad_request", "Invalid request.");
  await g.admin.from("workspace_integrations").update({ events }).eq("id", g.hook.id);
  return NextResponse.json({ ok: true });
}

/** Send a test message again. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  const url = open(g.hook.url_enc);
  if (!url) return fail(500, "failed", "This connection can't be read. Remove it and add it again.");
  const status = await sendTest(g.hook.provider, url, g.ws.name);
  await g.admin.from("workspace_integrations").update({ last_status: status === "ok" ? "Test sent" : `Test failed (${status})`, last_at: new Date().toISOString() }).eq("id", g.hook.id);
  return status === "ok" ? NextResponse.json({ ok: true }) : fail(422, "test_failed", `The test didn't go through (${status}).`);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  await g.admin.from("workspace_integrations").delete().eq("id", g.hook.id);
  return NextResponse.json({ ok: true });
}
