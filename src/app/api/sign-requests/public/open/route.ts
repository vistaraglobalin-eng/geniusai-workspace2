import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/storage/files";
import { loadByToken } from "@/lib/sign-requests/server";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** For a signing link: short-lived links to the document (and the completed copy once everyone has signed). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const admin = createSupabaseAdminClient();
  const ctx = typeof body.token === "string" ? await loadByToken(admin, body.token) : null;
  if (!ctx) return fail(404, "not_found", "This signing link isn't valid.");
  const r = ctx.request;
  if (r.status === "cancelled") return fail(410, "cancelled", "This signing request was cancelled.");
  const { data: orig } = await admin.storage.from(FILES_BUCKET).createSignedUrl(r.source_object_key, 600);
  let completedUrl: string | null = null;
  if (r.status === "completed" && r.completed_object_key) {
    const name = `${r.document_name.replace(/\.pdf$/i, "")} (signed by all).pdf`;
    const { data: done } = await admin.storage.from(FILES_BUCKET).createSignedUrl(r.completed_object_key, 600, { download: name });
    completedUrl = done?.signedUrl ?? null;
  }
  if (!orig?.signedUrl && !completedUrl) return fail(404, "missing", "The document is no longer available.");
  return NextResponse.json({ url: orig?.signedUrl ?? null, completedUrl });
}
