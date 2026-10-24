import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WORKSPACE_COOKIE } from "@/lib/workspace";
import { safeNextPath } from "@/lib/auth/paths";

/** Switch the workspace you're working in (form POST from the sidebar). */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const id = String(form.get("workspaceId") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const back = NextResponse.redirect(new URL(next, request.nextUrl.origin), 303);
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return back;
  const { data } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", user.id).eq("workspace_id", id).maybeSingle();
  if (data) back.cookies.set(WORKSPACE_COOKIE, id, { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 365 });
  return back;
}
