"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  ACCENTS, ACCENT_SWATCHES, PREFS_COOKIE, PREFS_COOKIE_MAX_AGE,
  htmlAttributes, serializePreferences,
  type Accent, type Motion, type Preferences, type TextSize, type Theme
} from "@/lib/preferences";
import { savePreferences } from "./actions";
import { CLIENT_TEXT, LANGUAGES, LANGUAGE_ENGLISH, LANGUAGE_NAMES, isLang } from "@/lib/i18n";

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Match device", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon }
];
const TEXT_OPTIONS: { value: TextSize; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "large", label: "Large" }
];
const MOTION_OPTIONS: { value: Motion; label: string }[] = [
  { value: "system", label: "Match device" },
  { value: "reduce", label: "Reduce" },
  { value: "full", label: "Full" }
];

function applyToDocument(prefs: Preferences) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(htmlAttributes(prefs))) root.setAttribute(key, value);
  root.lang = prefs.lang;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFS_COOKIE}=${serializePreferences(prefs)}; Path=/; Max-Age=${PREFS_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function AppearanceSettings({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState<Preferences>(initial);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // If this device's look differs from the account's saved preferences, adopt the account's.
  useEffect(() => {
    applyToDocument(initial);
  }, [initial]);

  function update(patch: Partial<Preferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyToDocument(next); // instant, no reload
    if (patch.lang && patch.lang !== prefs.lang) router.refresh(); // menus are rendered on the server
    setStatus(null);
    // Debounce the account sync so rapid clicks make one request.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const result = await savePreferences(next);
      setStatus(result.error ? { kind: "error", text: result.error } : { kind: "success", text: "Saved to your account" });
    }, 500);
  }

  return (
    <div>
      <div className="settings-row">
        <div className="settings-row-text">
          <strong id="lang-label">Language{prefs.lang === "en" ? "" : ` · ${CLIENT_TEXT[prefs.lang].language}`}</strong>
          <span>{CLIENT_TEXT[prefs.lang].hint}</span>
        </div>
        <select className="text-input lang-select" aria-labelledby="lang-label" value={prefs.lang}
          onChange={(e) => { if (isLang(e.target.value)) update({ lang: e.target.value }); }}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l} lang={l}>{LANGUAGE_NAMES[l]}{l === "en" ? "" : ` · ${LANGUAGE_ENGLISH[l]}`}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div className="settings-row-text">
          <strong id="theme-label">Theme</strong>
          <span>“Match device” follows your phone or computer’s light/dark setting automatically.</span>
        </div>
        <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <label key={value} className={prefs.theme === value ? "selected" : ""}>
              <input type="radio" name="theme" value={value} checked={prefs.theme === value} onChange={() => update({ theme: value })} />
              <Icon size={15} aria-hidden="true" /> {label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-text">
          <strong id="accent-label">Accent colour</strong>
          <span>Used for buttons, links and highlights. Every option meets contrast guidelines in light and dark mode.</span>
        </div>
        <div className="swatches" role="radiogroup" aria-labelledby="accent-label">
          {ACCENTS.map((a: Accent) => (
            <label key={a} className={`swatch${prefs.accent === a ? " selected" : ""}`}>
              <input type="radio" name="accent" value={a} checked={prefs.accent === a} onChange={() => update({ accent: a })} />
              <span className="swatch-dot" style={{ background: ACCENT_SWATCHES[a].color }} aria-hidden="true">
                {prefs.accent === a && <Check size={16} />}
              </span>
              {ACCENT_SWATCHES[a].label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-text">
          <strong id="text-label">Text size</strong>
          <span>Makes all text about 12% larger. Browser zoom also works everywhere.</span>
        </div>
        <div className="segmented" role="radiogroup" aria-labelledby="text-label">
          {TEXT_OPTIONS.map(({ value, label }) => (
            <label key={value} className={prefs.text === value ? "selected" : ""}>
              <input type="radio" name="text" value={value} checked={prefs.text === value} onChange={() => update({ text: value })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-text">
          <strong id="motion-label">Motion</strong>
          <span>“Reduce” turns off animations and smooth scrolling.</span>
        </div>
        <div className="segmented" role="radiogroup" aria-labelledby="motion-label">
          {MOTION_OPTIONS.map(({ value, label }) => (
            <label key={value} className={prefs.motion === value ? "selected" : ""}>
              <input type="radio" name="motion" value={value} checked={prefs.motion === value} onChange={() => update({ motion: value })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="theme-preview" aria-hidden="true">
        <div className="mini-card"><strong>Preview</strong><span>This is how cards and text will look.</span></div>
        <button type="button" className="primary-button" tabIndex={-1}>Primary action</button>
        <button type="button" className="secondary-button" tabIndex={-1}>Secondary</button>
      </div>
      <p className="inline-status" role="status" aria-live="polite">
        {status && <span className={`inline-status ${status.kind}`}>{status.text}</span>}
      </p>
    </div>
  );
}
