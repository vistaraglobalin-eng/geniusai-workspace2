import "server-only";
import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePreferences } from "@/lib/preferences";
import type { Lang } from "@/lib/i18n";
import hi from "@/lib/locales/hi";
import bn from "@/lib/locales/bn";
import mr from "@/lib/locales/mr";
import ta from "@/lib/locales/ta";
import te from "@/lib/locales/te";
import gu from "@/lib/locales/gu";
import kn from "@/lib/locales/kn";
import ml from "@/lib/locales/ml";
import pa from "@/lib/locales/pa";

// Interface text is looked up by the English source string, so anything not yet
// translated simply shows in English. Product words people use in English
// (PDF, Excel, UPI, GST, Tally, AI) stay in Latin script in every language.
const DICTIONARIES: Record<Exclude<Lang, "en">, Record<string, string>> = { hi, bn, mr, ta, te, gu, kn, ml, pa };

/** The interface language for this request, from the preferences cookie (English by default). */
export async function getLang(): Promise<Lang> {
  return parsePreferences((await cookies()).get(PREFS_COOKIE)?.value).lang;
}

/** Translates interface text; untranslated text is returned unchanged. */
export function t(lang: Lang, english: string): string {
  return lang === "en" ? english : DICTIONARIES[lang][english] ?? english;
}

/** For checks: English strings that a language has no translation for. */
export function missingIn(lang: Exclude<Lang, "en">, strings: string[]): string[] {
  return strings.filter((s) => !(s in DICTIONARIES[lang]));
}
