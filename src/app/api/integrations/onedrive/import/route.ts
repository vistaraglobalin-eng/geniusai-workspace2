import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { saveFileForUser } from "@/lib/storage/server-save";
import { MsError, isItemId, msDownload, msToken } from "@/lib/integrations/onedrive";
import { mimeFromName } from "@/lib/integrations/mime";
import { emitFile } from "@/lib/integrations/emit";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Copies the chosen OneDrive files into Files (up to 10). */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx?.workspace) return fail(401, "not_signed_in", "Please sign in again.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access, so you can't add files.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && isItemId(x)).slice(0, 10);
  if (!ids.length) return fail(400, "bad_request", "Choose files first.");
  const admin = createSupabaseAdminClient();
  let token: string;
  try { token = await msToken(admin, ctx.user.id); } catch (e) { return e instanceof MsError ? fail(409, e.code, e.message) : fail(500, "failed", "Something went wrong."); }
  const added: { id: string; name: string }[] = [], problems: string[] = [];
  for (const id of ids) {
    try {
      const f = await msDownload(token, id, MAX_UPLOAD_BYTES);
      const mime = mimeFromName(f.name);
      if (!mime) { problems.push(`${f.name}: this file type isn't supported`); continue; }
      const saved = await saveFileForUser(supabase, { workspaceId: ctx.workspace.id, userId: ctx.user.id, name: f.name, mime, bytes: f.bytes });
      if ("error" in saved) { problems.push(`${f.name}: ${saved.error}`); continue; }
      added.push({ id: saved.id, name: saved.name });
      await emitFile(admin, saved.id, request.nextUrl.origin).catch(() => undefined);
    } catch (e) { problems.push(e instanceof MsError ? e.message : "A file couldn't be brought in."); }
  }
  return NextResponse.json({ added, problems }, { status: added.length ? 200 : 422 });
}
