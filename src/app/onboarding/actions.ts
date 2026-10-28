"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OnboardingState = { error?: string };

const MESSAGES: Record<string, string> = {
  not_signed_in: "Your session has ended. Please sign in again.",
  invalid_display_name: "Please enter your name (up to 80 characters).",
  invalid_workspace_name: "Please enter a workspace name (up to 80 characters).",
  invalid_currency: "Please choose a currency.",
  workspace_limit_reached: "You've reached the limit of 10 workspaces."
};

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("complete_onboarding", {
    p_display_name: String(formData.get("displayName") ?? ""),
    p_workspace_name: String(formData.get("workspaceName") ?? ""),
    p_kind: formData.get("kind") === "business" ? "business" : "personal",
    p_currency: String(formData.get("currency") ?? "USD")
  });

  if (error) {
    const known = Object.keys(MESSAGES).find((code) => error.message.includes(code));
    return { error: known ? MESSAGES[known] : "Something went wrong while setting up your workspace. Please try again." };
  }

  // "welcome" lets the analytics tracker count a finished onboarding once; the dashboard ignores it.
  redirect("/?welcome=1");
}
