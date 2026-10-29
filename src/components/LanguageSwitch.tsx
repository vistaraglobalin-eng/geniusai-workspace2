"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
import { PREFS_COOKIE, PREFS_COOKIE_MAX_AGE, parsePreferences, serializePreferences } from "@/lib/preferences";
import { CLIENT_TEXT, LANGUAGES, LANGUAGE_ENGLISH, LANGUAGE_NAMES, type Lang } from "@/lib/i18n";
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

/** Top-bar language menu: every language listed in its own script. */
export function LanguageSwitch({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const menu = useRef<HTMLDetailsElement>(null);

  function choose(next: Lang) {
    if (menu.current) menu.current.open = false;
    if (next !== lang) setInterfaceLanguage(next, () => startTransition(() => router.refresh()));
  }

  return (
    <details className="lang-menu" ref={menu}>
      <summary className="lang-switch" aria-label={`${CLIENT_TEXT[lang].language}: ${LANGUAGE_ENGLISH[lang]}`} aria-busy={pending || undefined}>
        <Languages size={15} aria-hidden="true" /><span lang={lang}>{LANGUAGE_NAMES[lang]}</span>
      </summary>
      <div className="lang-list" role="menu">
        {LANGUAGES.map((l) => (
          <button key={l} type="button" role="menuitemradio" aria-checked={l === lang} className={l === lang ? "current" : ""} onClick={() => choose(l)}>
            <span lang={l}>{LANGUAGE_NAMES[l]}</span>
            <em>{l === "en" ? "" : LANGUAGE_ENGLISH[l]}</em>
            {l === lang && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </details>
  );
}
