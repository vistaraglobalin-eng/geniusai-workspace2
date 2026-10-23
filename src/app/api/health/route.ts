import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function GET() {
  return NextResponse.json({
    app: "GeniusAI Workspace",
    status: "starter",
    supabaseConfigured: getSupabasePublicEnv().configured,
    note: "Health check only. Authentication, AI jobs, billing, and file processing are not implemented yet."
  });
}
