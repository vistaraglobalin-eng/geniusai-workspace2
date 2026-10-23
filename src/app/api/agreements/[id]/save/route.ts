import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markdownToDocx } from "@/lib/agreements/docx";
import { DOCX_MIME, saveFileForUser } from "@/lib/storage/server-save";
import { WorkerError, isWorkerConfigured, runWorkerTool } from "@/lib/pdf/worker";
import { downloadName, fail, loadAgreement } from "@/lib/agreements/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Saves the agreement into Files as Word, or as PDF (Word converted by the PDF worker). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const agreement = await loadAgreement(supabase, (await params).id);
  if (!agreement) return fail(404, "not_found", "That agreement isn't available.");

  let format: "docx" | "pdf" = "docx";
  try { format = ((await request.json()) as { format?: string }).format === "pdf" ? "pdf" : "docx"; } catch { /* default */ }
  if (format === "pdf" && !isWorkerConfigured()) return fail(503, "not_configured", "Saving as PDF needs the PDF service. Use Print → Save as PDF, or save as Word.");

  const docx = await markdownToDocx(agreement.content_md, { title: agreement.title, footer: agreement.status === "final" ? agreement.title : `DRAFT – ${agreement.title}` });
  let bytes = docx;
  let mime = DOCX_MIME;
  if (format === "pdf") {
    try {
      const r = await runWorkerTool("office-to-pdf", { name: downloadName(agreement.title, "docx"), mime: DOCX_MIME, bytes: docx }, {});
      bytes = r.files[0].bytes;
      mime = "application/pdf";
    } catch (err) {
      return fail(err instanceof WorkerError ? err.status : 502, "convert_failed", err instanceof WorkerError ? err.message : "The PDF couldn't be created.");
    }
  }
  const saved = await saveFileForUser(supabase, {
    workspaceId: agreement.workspace_id, userId: user.id, name: downloadName(`${agreement.title} v${agreement.current_version}`, format), mime, bytes, moduleKey: "contracts"
  });
  if ("error" in saved) return fail(500, "save_failed", saved.error);
  return NextResponse.json(saved);
}
