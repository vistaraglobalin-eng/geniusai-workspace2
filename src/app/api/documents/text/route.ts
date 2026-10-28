import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage/files";

// Plain text of a Word (.docx) or text file, for on-device tools such as Version compare.
// PDFs are read in the browser instead. Free: no AI is used.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_CHARS = 1_200_000;

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileId?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  if (!fileId) return fail(400, "bad_request", "Choose a file.");

  // Row-level security limits this to files the user can see.
  const { data } = await supabase.from("files")
    .select("object_key, original_filename, mime_type, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { object_key: string; original_filename: string; mime_type: string; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (f.mime_type !== DOCX && f.mime_type !== "text/plain" && f.mime_type !== "text/csv") {
    return fail(422, "unsupported_type", "Only Word (.docx) and text files are read here.");
  }

  const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
  if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
  const buffer = Buffer.from(await blob.arrayBuffer());
  let text: string;
  try {
    if (f.mime_type === DOCX) {
      const mod = await import("mammoth");
      const mammoth = ("default" in mod ? mod.default : mod) as typeof import("mammoth");
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }
  } catch {
    return fail(422, "unreadable", `"${f.original_filename}" couldn't be read. It may be damaged or password-protected.`);
  }
  if (!text.trim()) return fail(422, "empty", `No text was found in "${f.original_filename}".`);
  if (text.length > MAX_CHARS) return fail(422, "too_long", `"${f.original_filename}" is too long to compare.`);
  return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
}
