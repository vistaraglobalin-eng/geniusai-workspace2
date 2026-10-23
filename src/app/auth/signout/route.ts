import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST only, so a link or image on another site cannot sign people out.
// Default: this device only. Settings → "Sign out of all devices" sends scope=global.
export async function POST(request: NextRequest) {
  let scope: "local" | "global" = "local";
  try {
    const form = await request.formData();
    if (form.get("scope") === "global") scope = "global";
  } catch {
    /* no body: local sign-out */
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope });
  const target = new URL("/login", request.nextUrl.origin);
  if (scope === "global") target.searchParams.set("signedout", "all");
  return NextResponse.redirect(target, { status: 303 });
}
