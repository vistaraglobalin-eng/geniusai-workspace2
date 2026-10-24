import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files, images and /vendor (the PDF viewer's worker must load for signers who aren't signed in).
  matcher: ["/((?!_next/static|_next/image|vendor/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|js|css|woff2?)$).*)"]
};
