// Appearance preferences: theme, accent colour, text size, motion and interface language.
// Stored in a first-party cookie (so the server renders the right theme with no
// flash) and in profiles.preferences (so they follow the user across devices).
// Shared by server and client code; contains no secrets.

import { LANGUAGES, type Lang } from "./i18n";

export const THEMES = ["system", "light", "dark"] as const;
export const ACCENTS = ["lavender", "ocean", "emerald", "sunset", "rose", "graphite"] as const;
export const TEXT_SIZES = ["default", "large"] as const;
export const MOTIONS = ["system", "reduce", "full"] as const;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];
export type TextSize = (typeof TEXT_SIZES)[number];
export type Motion = (typeof MOTIONS)[number];

export type Preferences = { theme: Theme; accent: Accent; text: TextSize; motion: Motion; lang: Lang };

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", accent: "lavender", text: "default", motion: "system", lang: "en" };

export const PREFS_COOKIE = "gw_prefs";
export const PREFS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Display swatches (light-mode accent values, also used as the swatch colour). */
export const ACCENT_SWATCHES: Record<Accent, { label: string; color: string }> = {
  lavender: { label: "Orange", color: "#c2470c" },
  ocean: { label: "Ocean", color: "#1d65a6" },
  emerald: { label: "Emerald", color: "#127050" },
  sunset: { label: "Sunset", color: "#b23c0b" },
  rose: { label: "Rose", color: "#b3325b" },
  graphite: { label: "Graphite", color: "#3d4256" }
};

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Accepts anything (cookie text, JSON from the database) and returns safe preferences. */
export function parsePreferences(input: unknown): Preferences {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(decodeURIComponent(input));
    } catch {
      raw = null;
    }
  }
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    theme: pick(THEMES, obj.theme, DEFAULT_PREFERENCES.theme),
    accent: pick(ACCENTS, obj.accent, DEFAULT_PREFERENCES.accent),
    text: pick(TEXT_SIZES, obj.text, DEFAULT_PREFERENCES.text),
    motion: pick(MOTIONS, obj.motion, DEFAULT_PREFERENCES.motion),
    lang: pick(LANGUAGES, obj.lang, DEFAULT_PREFERENCES.lang)
  };
}

export function serializePreferences(prefs: Preferences): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/** Attributes for <html>; CSS keys every theme off these. */
export function htmlAttributes(prefs: Preferences) {
  return {
    "data-theme": prefs.theme,
    "data-accent": prefs.accent,
    "data-text": prefs.text,
    "data-motion": prefs.motion
  } as const;
}
