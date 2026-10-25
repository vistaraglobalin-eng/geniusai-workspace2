import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { seal } from "@/lib/integrations/crypto";
import { DEFAULT_EVENTS, EVENT_KEYS, checkHookUrl } from "@/lib/integrations/events";
import { sendTest } from "@/lib/integrations/webhooks";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Adds a Slack or Zapier/Make connection to the current workspace (owners and admins). Sends a test message first. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  const ws = ctx.workspace;
  if (!ws) return fail(400, "no_workspace", "Choose a workspace first.");
  if (!((ws.role === "owner" || ws.role === "admin") && ws.access === "edit")) return fail(403, "admins_only", "Only workspace owners and admins can connect apps.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const provider = body.provider === "slack" ? "slack" : body.provider === "webhook" ? "webhook" : null;
  if (!provider) return fail(400, "bad_request", "Invalid request.");
  const check = checkHookUrl(provider, typeof body.url === "string" ? body.url : "");
  if (!check.ok) return fail(422, "bad_url", check.message);
  const name = (typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "").slice(0, 80) || (provider === "slack" ? "Slack" : "Zapier");
  const events = Array.isArray(body.events) ? body.events.filter((e): e is string => typeof e === "string" && EVENT_KEYS.includes(e)) : [...DEFAULT_EVENTS[provider]];
  const admin = createSupabaseAdminClient();
  const { count, error: cErr } = await admin.from("workspace_integrations").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
  if (cErr) return fail(503, "setup_needed", "Connections need a one-time database update first.");
  if ((count ?? 0) >= 10) return fail(422, "too_many", "A workspace can have up to 10 connections.");
  const test = await sendTest(provider, check.url, ws.name);
  if (test !== "ok") return fail(422, "test_failed", provider === "slack"
    ? `Slack didn't accept the test message (${test}). Check the webhook link is current and the app is installed in your Slack.`
    : `The webhook didn't answer (${test}). In Zapier, make sure the “Catch Hook” step is set up, then try again.`);
  const { data, error } = await admin.from("workspace_integrations").insert({
    workspace_id: ws.id, provider, name, url_enc: seal(check.url), url_hint: check.hint, events, created_by: ctx.user.id, last_status: "Connected — test sent", last_at: new Date().toISOString()
  }).select("id, provider, name, url_hint, events, last_status, last_at").single();
  if (error) return fail(500, "failed", "The connection couldn't be saved.");
  return NextResponse.json({ hook: data });
}
