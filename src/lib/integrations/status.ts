import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { googleConfig, googleSetupChecks, type SetupCheck } from "./google";

export type DriveStatus = { configured: boolean; pickerReady: boolean; connected: boolean; email: string | null; setupNeeded: boolean; checks: SetupCheck[] };

/** Is Google Drive set up on the server, and has this person connected their Drive? */
export async function driveStatus(supabase: SupabaseClient, userId: string): Promise<DriveStatus> {
  const cfg = googleConfig();
  const { data, error } = await supabase.from("user_integrations").select("account_email").eq("user_id", userId).eq("provider", "google").maybeSingle();
  return {
    configured: !!cfg, pickerReady: !!cfg?.apiKey && !!cfg?.projectNumber, checks: googleSetupChecks(),
    connected: !error && !!data, email: (data as { account_email: string | null } | null)?.account_email ?? null,
    setupNeeded: !!error && /does not exist|schema cache/i.test(error.message)
  };
}

/** Has this person connected OneDrive (and is it set up on the server)? */
export async function oneDriveStatus(supabase: SupabaseClient, userId: string) {
  const { msConfig } = await import("./onedrive");
  const { data, error } = await supabase.from("user_integrations").select("account_email").eq("user_id", userId).eq("provider", "onedrive").maybeSingle();
  return { configured: !!msConfig(), connected: !error && !!data, email: (data as { account_email: string | null } | null)?.account_email ?? null };
}
