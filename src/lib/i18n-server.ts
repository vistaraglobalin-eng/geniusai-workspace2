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
import es from "@/lib/locales/es";
import fr from "@/lib/locales/fr";
import de from "@/lib/locales/de";
import pt_BR from "@/lib/locales/pt-BR";
import it from "@/lib/locales/it";
import nl from "@/lib/locales/nl";
import ru from "@/lib/locales/ru";
import uk from "@/lib/locales/uk";
import pl from "@/lib/locales/pl";
import tr from "@/lib/locales/tr";
import ar from "@/lib/locales/ar";
import ur from "@/lib/locales/ur";
import fa from "@/lib/locales/fa";
import he from "@/lib/locales/he";
import zh_CN from "@/lib/locales/zh-CN";
import zh_TW from "@/lib/locales/zh-TW";
import ja from "@/lib/locales/ja";
import ko from "@/lib/locales/ko";
import id from "@/lib/locales/id";
import ms from "@/lib/locales/ms";
import vi from "@/lib/locales/vi";
import th from "@/lib/locales/th";
import fil from "@/lib/locales/fil";
import sw from "@/lib/locales/sw";
import el from "@/lib/locales/el";
import cs from "@/lib/locales/cs";
import ro from "@/lib/locales/ro";
import hu from "@/lib/locales/hu";
import sv from "@/lib/locales/sv";
import ne from "@/lib/locales/ne";

// Interface text is looked up by the English source string, so anything not yet
// translated simply shows in English. Product words people use in English
// (PDF, Excel, UPI, GST, Tally, AI) stay in Latin script in every language.
const DICTIONARIES: Record<Exclude<Lang, "en">, Record<string, string>> = {
  hi, bn, mr, ta, te, gu, kn, ml, pa,
  es, fr, de, "pt-BR": pt_BR, it, nl, ru, uk, pl, tr, ar, ur, fa, he, "zh-CN": zh_CN, "zh-TW": zh_TW, ja, ko, id, ms, vi, th, fil, sw, el, cs, ro, hu, sv, ne
};

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
