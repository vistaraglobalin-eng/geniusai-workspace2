import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FILES_BUCKET, MAX_UPLOAD_BYTES, safeFilename } from "@/lib/storage/files";
import {
  COMPRESS_LEVELS, IMAGE_MIMES_FOR_PDF, JPG_QUALITIES, LIMITS, OFFICE_MIMES, PAGE_NUMBER_FORMATS, PAGE_NUMBER_POSITIONS,
  PDF_MIME, TOOL_INFO, isPdfTool, isWorkerTool,
  type PageNumberFormat, type PageNumberPosition, type PdfRunResponse, type PdfTool, type WorkerTool
} from "@/lib/pdf/catalog";
import {
  PdfToolError, addPageNumbers, addWatermark, extractPages, imagesToPdf, mergePdfs,
  removePages, reorderPages, rotatePdf, splitPdf
} from "@/lib/pdf/tools";
import { WorkerError, runWorkerTool } from "@/lib/pdf/worker";

// Worker tools (LibreOffice, Ghostscript) can take a couple of minutes on big files.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status });
}

type FileRow = { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null };
type Output = { suffix: string; mime: string; bytes: Uint8Array; pages?: number };

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly string[]).includes(str(v)) ? (v as T) : fallback);

async function runLocalTool(tool: PdfTool, inputs: { bytes: Uint8Array; mime: string }[], o: Record<string, unknown>): Promise<Output[]> {
  const first = inputs[0].bytes;
  const pdf = (r: { suffix: string; bytes: Uint8Array; pages: number }): Output => ({ ...r, mime: PDF_MIME });
  switch (tool) {
    case "merge": return [pdf(await mergePdfs(inputs.map((i) => i.bytes)))];
    case "split":
      return (o.mode === "every"
        ? await splitPdf(first, { mode: "every", every: Number(o.every) })
        : await splitPdf(first, { mode: "ranges", ranges: str(o.ranges) })).map(pdf);
    case "remove-pages": return [pdf(await removePages(first, str(o.pages)))];
    case "extract-pages": return [pdf(await extractPages(first, str(o.pages)))];
    case "organize": return [pdf(await reorderPages(first, str(o.order)))];
    case "rotate": return [pdf(await rotatePdf(first, Number(o.angle), str(o.pages)))];
    case "page-numbers":
      return [pdf(await addPageNumbers(first, {
        position: oneOf<PageNumberPosition>(PAGE_NUMBER_POSITIONS, o.position, "bottom-center"),
        format: oneOf<PageNumberFormat>(PAGE_NUMBER_FORMATS, o.format, "n"),
        start: Number(o.start) || 1,
        skipFirst: o.skipFirst === true
      }))];
    case "watermark": return [pdf(await addWatermark(first, { text: str(o.text, 200), opacity: Number(o.opacity) }))];
    case "images-to-pdf": return [pdf(await imagesToPdf(inputs, { pageSize: o.pageSize === "fit" ? "fit" : "a4" }))];
    default: throw new PdfToolError("Unknown tool.");
  }
}

/** Only the options each worker tool understands are forwarded. */
function workerOptions(tool: WorkerTool, o: Record<string, unknown>): Record<string, unknown> {
  switch (tool) {
    case "compress": return { level: oneOf(COMPRESS_LEVELS, o.level, "recommended") };
    case "protect": return { password: str(o.password, 128) };
    case "unlock": return { password: str(o.password, 128) };
    case "pdf-to-jpg": return { quality: oneOf(JPG_QUALITIES, o.quality, "standard") };
    default: return {};
  }
}

function extensionFor(mime: string): string {
  return mime === "image/jpeg" ? "jpg" : mime === "application/zip" ? "zip" : "pdf";
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "Invalid request.");
  }
  const tool = body.tool;
  if (!isPdfTool(tool)) return fail(400, "bad_request", "Unknown tool.");
  const info = TOOL_INFO[tool];
  const ids = Array.isArray(body.fileIds) ? [...new Set(body.fileIds.filter((v): v is string => typeof v === "string" && UUID.test(v)))] : [];
  const options = body.options && typeof body.options === "object" ? (body.options as Record<string, unknown>) : {};

  const single = info.input === "pdf-single" || info.input === "office-single";
  if (ids.length === 0) return fail(400, "no_files", info.input === "image-multi" ? "Choose at least one image." : "Choose a file.");
  if (single && ids.length !== 1) return fail(400, "one_file", "This tool works on one file at a time.");
  if (tool === "merge" && ids.length < 2) return fail(400, "two_files", "Choose at least two PDFs to merge.");
  if (ids.length > LIMITS.maxFiles) return fail(400, "too_many", `Choose up to ${LIMITS.maxFiles} files.`);

  // Row-level security: only files in workspaces this user belongs to come back.
  const { data } = await supabase
    .from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at")
    .in("id", ids);
  const byId = new Map(((data ?? []) as FileRow[]).map((f) => [f.id, f]));
  const rows = ids.map((id) => byId.get(id));
  if (rows.some((r) => !r || r.deleted_at)) return fail(404, "file_not_found", "One of the files is no longer available.");
  const files = rows as FileRow[];
  const workspaceId = files[0].workspace_id;
  if (files.some((f) => f.workspace_id !== workspaceId)) return fail(400, "mixed_workspaces", "All files must be in the same workspace.");
  if (files.some((f) => f.scan_status === "quarantined" || f.scan_status === "failed")) return fail(422, "file_blocked", "One of the files was blocked by the safety check.");

  const allowed: readonly string[] = info.input === "image-multi" ? IMAGE_MIMES_FOR_PDF : info.input === "office-single" ? OFFICE_MIMES : [PDF_MIME];
  const wrongType = files.find((f) => !allowed.includes(f.mime_type));
  if (wrongType) {
    const expected = info.input === "image-multi" ? "a JPG or PNG" : info.input === "office-single" ? "a Word, Excel, PowerPoint, OpenDocument, RTF, CSV or text file" : "a PDF";
    return fail(422, "wrong_type", `"${wrongType.original_filename}" isn't ${expected}.`);
  }
  if (files.reduce((sum, f) => sum + Number(f.byte_size), 0) > LIMITS.maxTotalBytes) {
    return fail(413, "too_large", "These files are too large to process together (60 MB total). Try fewer files.");
  }

  // Download inputs (storage policies check access again).
  const inputs: { bytes: Uint8Array; mime: string }[] = [];
  for (const f of files) {
    const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
    if (error || !blob) return fail(404, "file_not_found", `"${f.original_filename}" couldn't be opened.`);
    inputs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: f.mime_type });
  }

  let outputs: Output[];
  let note: string | undefined;
  try {
    if (isWorkerTool(tool)) {
      const r = await runWorkerTool(tool, { name: files[0].original_filename, mime: files[0].mime_type, bytes: inputs[0].bytes }, workerOptions(tool, options));
      outputs = r.files.map((f) => ({ suffix: f.name, mime: f.mime, bytes: f.bytes }));
      note = r.note;
    } else {
      outputs = await runLocalTool(tool, inputs, options);
    }
  } catch (err) {
    if (err instanceof PdfToolError) return fail(422, "tool_error", err.message);
    if (err instanceof WorkerError) return fail(err.status, "worker_error", err.message);
    return fail(500, "tool_failed", "Something went wrong while processing the file. Please try again.");
  }
  if (outputs.length === 0) return fail(500, "tool_failed", "The tool produced no result.");
  if (outputs.some((o) => o.bytes.byteLength > MAX_UPLOAD_BYTES)) {
    return fail(413, "result_too_large", "The result would be larger than 25 MB, which is the file limit. Try fewer pages or files.");
  }

  // Save each result as a new file in the same workspace (originals untouched).
  const base = files[0].original_filename.replace(/\.[^.]+$/, "").slice(0, 120) || "document";
  const saved: PdfRunResponse["files"] = [];
  const uploadedKeys: string[] = [];
  // All-or-nothing: if any part fails, delete stored objects, then hide records already created.
  // (Objects first: storage rules hide soft-deleted files, and deleting needs read access.)
  const rollback = async () => {
    if (uploadedKeys.length) await supabase.storage.from(FILES_BUCKET).remove(uploadedKeys);
    if (saved.length) await supabase.from("files").update({ deleted_at: new Date().toISOString() }).in("id", saved.map((f) => f.id));
  };

  for (const out of outputs) {
    const id = crypto.randomUUID();
    const name = tool === "office-to-pdf" ? `${base}.pdf` : `${base} (${out.suffix}).${extensionFor(out.mime)}`;
    const key = `${workspaceId}/${user.id}/${id}-${safeFilename(name)}`;
    const { error: upErr } = await supabase.storage
      .from(FILES_BUCKET)
      .upload(key, new Blob([new Uint8Array(out.bytes)], { type: out.mime }), { contentType: out.mime, upsert: false });
    if (upErr) {
      await rollback();
      return fail(500, "save_failed", "The result couldn't be saved to your workspace. Please try again.");
    }
    uploadedKeys.push(key);
    const { error: rowErr } = await supabase.from("files").insert({
      id, workspace_id: workspaceId, uploaded_by: user.id, object_key: key,
      original_filename: name, mime_type: out.mime, byte_size: out.bytes.byteLength, module_key: "documents"
    });
    if (rowErr) {
      await rollback();
      return fail(500, "save_failed", "The result couldn't be saved to your workspace. Please try again.");
    }
    saved.push({ id, name, objectKey: key, mimeType: out.mime, byteSize: out.bytes.byteLength, pages: out.pages });
  }

  return NextResponse.json({ files: saved, note } satisfies PdfRunResponse);
}
