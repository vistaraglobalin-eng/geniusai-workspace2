"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PREFS_COOKIE, PREFS_COOKIE_MAX_AGE, parsePreferences, serializePreferences, type Preferences } from "@/lib/preferences";

export type FormState = { ok?: boolean; error?: string };

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Saves appearance to the profile (follows the user) and the cookie (no-flash rendering). */
export async function savePreferences(input: Preferences): Promise<FormState> {
  const prefs = parsePreferences(input);
  const cookieStore = await cookies();
  cookieStore.set(PREFS_COOKIE, serializePreferences(prefs), {
    path: "/",
    maxAge: PREFS_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false // read by the theme switcher; contains no personal data
  });

  const { supabase, user } = await requireUser();
  if (!user) return { ok: true }; // signed out: cookie only
  const { error } = await supabase.from("profiles").update({ preferences: prefs }).eq("user_id", user.id);
  return error ? { error: "Saved on this device, but couldn't sync to your account." } : { ok: true };
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("displayName") ?? "").trim();
  if (name.length < 1 || name.length > 80) return { error: "Please enter a name between 1 and 80 characters." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session has ended. Please sign in again." };
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("user_id", user.id);
  if (error) return { error: "Your name couldn't be saved. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

const CURRENCY = /^[A-Z]{3}$/;

export async function updateWorkspace(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const kind = formData.get("kind") === "business" ? "business" : "personal";
  const currency = String(formData.get("currency") ?? "").toUpperCase();
  if (name.length < 1 || name.length > 80) return { error: "Please enter a workspace name between 1 and 80 characters." };
  if (!CURRENCY.test(currency)) return { error: "Please choose a currency." };

  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session has ended. Please sign in again." };

  // Row-level security only lets the owner update; .select() tells us if a row changed.
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name, kind, default_currency: currency })
    .eq("id", id)
    .select("id");
  if (error) return { error: "The workspace couldn't be saved. Please try again." };
  if (!data || data.length === 0) return { error: "Only the workspace owner can change these settings." };
  revalidatePath("/", "layout");
  return { ok: true };
}
