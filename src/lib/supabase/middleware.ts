import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";
import { isPublicPath } from "@/lib/auth/paths";

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login. Signed-in visitors who open /login go to the dashboard.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, key } = getSupabasePublicEnv();
  if (!url || !key) return response; // Pages show a setup message instead.

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Do not put code between createServerClient and getUser: it validates the session.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, next?: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = "";
    if (next) target.searchParams.set("next", next);
    const redirect = NextResponse.redirect(target);
    // Keep any refreshed session cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && !isPublicPath(pathname)) {
    return redirectTo("/login", pathname === "/" ? undefined : pathname + search);
  }
  if (user && pathname === "/login") {
    return redirectTo("/");
  }
  return response;
}
