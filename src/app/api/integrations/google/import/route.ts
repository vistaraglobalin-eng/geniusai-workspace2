import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { saveFileForUser } from "@/lib/storage/server-save";
import { GoogleError, accessToken, downloadFromDrive } from "@/lib/integrations/google";
import { emitFile } from "@/lib/integrations/emit";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** Brings files you picked in Google Drive into Files (up to 10 at a time). */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access, so you can't add files.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && DRIVE_ID.test(x)).slice(0, 10);
  if (!ids.length) return fail(400, "bad_request", "Pick files in Google Drive first.");
  let token: string;
  try { token = await accessToken(createSupabaseAdminClient(), ctx.user.id); }
  catch (e) { return e instanceof GoogleError ? fail(409, e.code, e.message) : fail(500, "failed", "Something went wrong."); }

  const added: { id: string; name: string }[] = [], problems: string[] = [];
  for (const id of ids) {
    try {
      const f = await downloadFromDrive(token, id, MAX_UPLOAD_BYTES);
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(f.mime)) { problems.push(`${f.name}: this file type isn't supported`); continue; }
      const saved = await saveFileForUser(supabase, { workspaceId: ctx.workspace.id, userId: ctx.user.id, name: f.name, mime: f.mime, bytes: f.bytes });
      if ("error" in saved) problems.push(`${f.name}: ${saved.error}`);
      else { added.push({ id: saved.id, name: saved.name }); await emitFile(createSupabaseAdminClient(), saved.id, request.nextUrl.origin).catch(() => undefined); }
    } catch (e) { problems.push(e instanceof GoogleError ? e.message : "A file couldn't be brought in."); }
  }
  return NextResponse.json({ added, problems }, { status: added.length ? 200 : 422 });
}
