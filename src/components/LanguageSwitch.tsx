"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { PREFS_COOKIE, PREFS_COOKIE_MAX_AGE, parsePreferences, serializePreferences } from "@/lib/preferences";
import type { Lang } from "@/lib/i18n";
import { savePreferences } from "@/app/settings/actions";
import { track } from "@/lib/analytics";

function readPrefsCookie() {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${PREFS_COOKIE}=`))?.slice(PREFS_COOKIE.length + 1);
  return parsePreferences(raw);
}

/** Writes the language into the preferences cookie, re-renders the page and syncs it to the account. */
export function setInterfaceLanguage(lang: Lang, refresh: () => void) {
  const prefs = { ...readPrefsCookie(), lang };
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFS_COOKIE}=${serializePreferences(prefs)}; Path=/; Max-Age=${PREFS_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  document.documentElement.lang = lang;
  refresh();
  void savePreferences(prefs).catch(() => undefined); // this device already switched; account sync is best effort
  track("language_changed", { lang });
}

/** Top-bar button: one tap between English and Hindi. */
export function LanguageSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Lang = lang === "hi" ? "en" : "hi";
  return (
    <button type="button" className="lang-switch" disabled={pending} lang={next}
      onClick={() => setInterfaceLanguage(next, () => startTransition(() => router.refresh()))}
      aria-label={next === "hi" ? "हिन्दी में बदलें (Switch to Hindi)" : "Switch to English (English में बदलें)"}>
      <Languages size={15} aria-hidden="true" /><span>{next === "hi" ? "हिन्दी" : "English"}</span>
    </button>
  );
}
