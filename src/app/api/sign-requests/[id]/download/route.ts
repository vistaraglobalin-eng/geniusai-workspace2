import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FILES_BUCKET } from "@/lib/storage/files";
import { UUID, fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";

/** Short-lived download link for the completed, signed PDF (workspace members only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, "bad_request", "Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "not_signed_in", "Please sign in again.");
  const { data } = await supabase.from("signature_requests").select("document_name, completed_object_key, status").eq("id", id).maybeSingle();
  const req = data as { document_name: string; completed_object_key: string | null; status: string } | null;
  if (!req) return fail(404, "not_found", "That request wasn't found.");
  if (req.status !== "completed" || !req.completed_object_key) return fail(409, "not_ready", "Not everyone has signed yet.");
  const name = `${req.document_name.replace(/\.pdf$/i, "")} (signed by all).pdf`;
  const { data: link } = await createSupabaseAdminClient().storage.from(FILES_BUCKET).createSignedUrl(req.completed_object_key, 120, { download: name });
  if (!link?.signedUrl) return fail(500, "link_failed", "The download link couldn't be created.");
  return NextResponse.json({ url: link.signedUrl });
}
