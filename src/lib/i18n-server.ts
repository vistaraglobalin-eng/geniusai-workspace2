import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePreferences } from "@/lib/preferences";
import type { Lang } from "@/lib/i18n";

/** The interface language for this request, from the preferences cookie (English by default). */
export async function getLang(): Promise<Lang> {
  return parsePreferences((await cookies()).get(PREFS_COOKIE)?.value).lang;
}
