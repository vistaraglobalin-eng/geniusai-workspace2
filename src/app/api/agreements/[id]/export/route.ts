import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markdownToDocx } from "@/lib/agreements/docx";
import { DOCX_MIME } from "@/lib/storage/server-save";
import { downloadName, fail, loadAgreement } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Download as Word (.docx) or Markdown (.md). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const agreement = await loadAgreement(supabase, (await params).id);
  if (!agreement) return fail(404, "not_found", "That agreement isn't available.");
  const format = request.nextUrl.searchParams.get("format") === "md" ? "md" : "docx";

  const body = format === "md"
    ? new TextEncoder().encode(agreement.content_md)
    : await markdownToDocx(agreement.content_md, { title: agreement.title, footer: agreement.status === "final" ? agreement.title : `DRAFT – ${agreement.title}` });
  const name = downloadName(agreement.title, format);
  return new NextResponse(new Blob([new Uint8Array(body)]), {
    status: 200,
    headers: {
      "content-type": format === "md" ? "text/markdown; charset=utf-8" : DOCX_MIME,
      "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store"
    }
  });
}
