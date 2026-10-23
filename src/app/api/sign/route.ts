import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET, MAX_UPLOAD_BYTES } from "@/lib/storage/files";
import { saveFileForUser } from "@/lib/storage/server-save";
import { PdfToolError } from "@/lib/pdf/tools";
import { decodeSignature, parsePlacements, signPdf } from "@/lib/pdf/sign";
import { UUID, fail } from "@/lib/agreements/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Signs a PDF the user can access and saves the signed copy as a new file. The original is never changed. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return fail(401, "not_signed_in", "Please sign in again.");

  let body: { fileId?: unknown; signature?: unknown; placements?: unknown; addDate?: unknown; signerName?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return fail(400, "bad_request", "Invalid request."); }
  const fileId = typeof body.fileId === "string" && UUID.test(body.fileId) ? body.fileId : null;
  const signerName = typeof body.signerName === "string" ? body.signerName.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!fileId) return fail(400, "bad_request", "Choose a PDF to sign.");
  if (signerName.length < 2) return fail(422, "name_required", "Enter your full name for the signing record.");

  const { data } = await supabase.from("files")
    .select("id, workspace_id, object_key, original_filename, mime_type, byte_size, scan_status, deleted_at").eq("id", fileId).maybeSingle();
  const f = data as { id: string; workspace_id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: string; deleted_at: string | null } | null;
  if (!f || f.deleted_at) return fail(404, "file_not_found", "That file is no longer available.");
  if (f.mime_type !== "application/pdf") return fail(422, "not_pdf", "Only PDFs can be signed. Convert the file to PDF first.");
  if (f.scan_status === "quarantined" || f.scan_status === "failed") return fail(422, "file_blocked", "This file was blocked by the safety check.");
  if (Number(f.byte_size) > MAX_UPLOAD_BYTES) return fail(413, "too_large", "This PDF is too large to sign here.");

  try {
    const signature = decodeSignature(body.signature);
    const placements = parsePlacements(body.placements);
    const { data: blob, error } = await supabase.storage.from(FILES_BUCKET).download(f.object_key);
    if (error || !blob) return fail(404, "file_not_found", "That file couldn't be opened.");
    const original = new Uint8Array(await blob.arrayBuffer());
    const originalSha256 = createHash("sha256").update(original).digest("hex");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const signedAt = new Date();

    const result = await signPdf(original, signature, placements, {
      addDate: body.addDate === true,
      record: { documentName: f.original_filename, signerName, signerEmail: user.email, ip, signedAt, originalSha256 }
    });
    const base = f.original_filename.replace(/\.pdf$/i, "").slice(0, 200);
    const saved = await saveFileForUser(supabase, {
      workspaceId: f.workspace_id, userId: user.id, name: `${base} (signed).pdf`, mime: "application/pdf", bytes: result.bytes, moduleKey: "contracts"
    });
    if ("error" in saved) return fail(500, "save_failed", saved.error);

    // Tamper-evident trail: who signed what, when, and the fingerprints before and after.
    await createSupabaseAdminClient().from("audit_logs").insert({
      workspace_id: f.workspace_id, actor_user_id: user.id, action_key: "document.signed", target_type: "file", target_id: saved.id,
      metadata: {
        source_file_id: f.id, signer_name: signerName, signer_email: user.email, ip, signed_at: signedAt.toISOString(),
        pages: result.signedPages, original_sha256: originalSha256, signed_sha256: createHash("sha256").update(result.bytes).digest("hex")
      }
    });
    return NextResponse.json({ id: saved.id, name: saved.name, objectKey: saved.objectKey, pages: result.signedPages });
  } catch (err) {
    if (err instanceof PdfToolError) return fail(422, "sign_failed", err.message);
    return fail(500, "sign_failed", "The PDF couldn't be signed. Please try again.");
  }
}
