import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { UUID, fail } from "@/lib/agreements/server";
import { MAX_SHARES_PER_SPACE, SHARE_EXPIRY_DAYS, SHARE_LABEL_MAX, cleanText, expiryFromDays, isShareMode, shareBlock, type ShareRow } from "@/lib/shares";
import { newShareToken } from "@/lib/shares-server";

export const dynamic = "force-dynamic";

const COLUMNS = "id, space_id, workspace_id, token, label, mode, created_by, expires_at, revoked_at, view_count, upload_count, last_used_at, created_at";
const missingTable = (m?: string) => !!m && /space_shares|does not exist|schema cache/i.test(m);

async function guard(id: string, needEdit: boolean) {
  if (!UUID.test(id)) return { error: fail(400, "bad_request", "Invalid request.") };
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return { error: fail(401, "not_signed_in", "Please sign in again.") };
  if (!ctx.workspace) return { error: fail(400, "no_workspace", "Choose a workspace first.") };
  if (needEdit && ctx.workspace.access === "view") return { error: fail(403, "view_only", "You have view-only access, so you can't share spaces.") };
  // Row-level security: only spaces of a workspace you belong to come back.
  const { data } = await supabase.from("spaces").select("id, name").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return { error: fail(404, "not_found", "That space wasn't found.") };
  return { supabase, workspaceId: ctx.workspace.id, userId: ctx.user.id };
}

/** Links for this space (newest first), active ones first. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id, false);
  if ("error" in g) return g.error;
  const { data, error } = await g.supabase.from("space_shares").select(COLUMNS).eq("space_id", id).order("created_at", { ascending: false }).limit(50);
  if (error) return missingTable(error.message) ? fail(503, "setup_needed", "Shared folders need a one-time database update first.") : fail(500, "failed", "Links couldn't be loaded.");
  const rows = (data ?? []) as ShareRow[];
  return NextResponse.json({ shares: rows.map((s) => ({ ...s, block: shareBlock(s) })) });
}

/** Create a link. Body: { mode, days, label? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id, true);
  if ("error" in g) return g.error;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  if (!isShareMode(body.mode)) return fail(422, "bad_mode", "Choose what people can do with the link.");
  const days = Number(body.days);
  if (!(SHARE_EXPIRY_DAYS as readonly number[]).includes(days)) return fail(422, "bad_expiry", "Choose how long the link works.");
  const label = cleanText(body.label, SHARE_LABEL_MAX) || null;

  const admin = createSupabaseAdminClient();
  const { data: active, error: cErr } = await admin.from("space_shares").select("id, revoked_at, expires_at").eq("space_id", id).is("revoked_at", null).limit(100);
  if (cErr) return missingTable(cErr.message) ? fail(503, "setup_needed", "Shared folders need a one-time database update first.") : fail(500, "failed", "The link couldn't be created.");
  const live = ((active ?? []) as Pick<ShareRow, "revoked_at" | "expires_at">[]).filter((s) => !shareBlock(s)).length;
  if (live >= MAX_SHARES_PER_SPACE) return fail(422, "too_many", `A space can have up to ${MAX_SHARES_PER_SPACE} active links. Turn one off first.`);

  const { data, error } = await admin.from("space_shares").insert({
    space_id: id, workspace_id: g.workspaceId, token: newShareToken(), label, mode: body.mode,
    created_by: g.userId, expires_at: expiryFromDays(days)
  }).select(COLUMNS).single();
  if (error || !data) return fail(500, "failed", "The link couldn't be created.");
  return NextResponse.json({ share: { ...(data as ShareRow), block: null } });
}
