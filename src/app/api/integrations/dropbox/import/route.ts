import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadWorkspaceContext } from "@/lib/workspace";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { saveFileForUser } from "@/lib/storage/server-save";
import { isDropboxDirectLink } from "@/lib/integrations/dropbox";
import { mimeFromName } from "@/lib/integrations/mime";
import { emitFile } from "@/lib/integrations/emit";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Copies files picked in the Dropbox Chooser into Files (up to 10). Only Dropbox download links are fetched. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx?.workspace) return fail(401, "not_signed_in", "Please sign in again.");
  if (ctx.workspace.access === "view") return fail(403, "view_only", "You have view-only access, so you can't add files.");
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return fail(400, "bad_request", "Invalid request."); }
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 10) as { link?: unknown; name?: unknown }[];
  if (!files.length) return fail(400, "bad_request", "Pick files in Dropbox first.");
  const added: { id: string; name: string }[] = [], problems: string[] = [];
  const admin = createSupabaseAdminClient();
  for (const f of files) {
    const name = typeof f.name === "string" ? f.name.replace(/[\r\n]/g, " ").trim().slice(0, 200) : "";
    const link = typeof f.link === "string" ? f.link : "";
    const mime = mimeFromName(name);
    if (!name || !isDropboxDirectLink(link)) { problems.push(`${name || "A file"}: not a Dropbox file link`); continue; }
    if (!mime) { problems.push(`${name}: this file type isn't supported`); continue; }
    try {
      const res = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(45_000) });
      if (!res.ok || !isDropboxDirectLink(res.url)) { problems.push(`${name}: Dropbox didn't send the file`); continue; }
      if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) { problems.push(`${name}: files can be up to 25 MB`); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_UPLOAD_BYTES) { problems.push(`${name}: files can be up to 25 MB`); continue; }
      const saved = await saveFileForUser(supabase, { workspaceId: ctx.workspace.id, userId: ctx.user.id, name, mime, bytes });
      if ("error" in saved) { problems.push(`${name}: ${saved.error}`); continue; }
      added.push({ id: saved.id, name: saved.name });
      await emitFile(admin, saved.id, request.nextUrl.origin).catch(() => undefined);
    } catch { problems.push(`${name}: the download didn't finish`); }
  }
  return NextResponse.json({ added, problems }, { status: added.length ? 200 : 422 });
}
