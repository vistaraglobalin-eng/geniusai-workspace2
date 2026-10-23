import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Download my data": everything the app stores about the signed-in person,
 * read through row-level security (so it can never include other people's data
 * beyond what they can already see). Files themselves are downloaded from Files.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const [profile, memberships, files, jobs] = await Promise.all([
    supabase.from("profiles").select("display_name, locale, country_code, preferences, onboarding_completed_at, created_at, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("role, created_at, workspace:workspaces(id, name, kind, default_currency, created_at)").eq("user_id", user.id),
    supabase.from("files").select("id, workspace_id, original_filename, mime_type, byte_size, module_key, scan_status, created_at, deleted_at").eq("uploaded_by", user.id).order("created_at", { ascending: false }),
    supabase.from("ai_jobs").select("id, workspace_id, module_key, task_type, status, input_params, result, charged_credits, created_at, completed_at").eq("requested_by", user.id).order("created_at", { ascending: false })
  ]);

  const body = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null, created_at: user.created_at ?? null },
    profile: profile.data ?? null,
    workspaces: memberships.data ?? [],
    files_uploaded: files.data ?? [],
    ai_results: jobs.data ?? [],
    note: "File contents are not included; download them from Files. Credit history is per workspace and visible to its members."
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="geniusai-my-data-${date}.json"`,
      "cache-control": "no-store"
    }
  });
}
