import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/** Public health check: which version is live and which services are configured (true/false only, never values). */
export async function GET() {
  return NextResponse.json({
    app: "GeniusAI Workspace",
    status: "ok",
    version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? "vercel" : "local",
    configured: {
      supabase: getSupabasePublicEnv().configured,
      serverKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
      email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      pdfWorker: Boolean(process.env.PDF_WORKER_URL && process.env.PDF_WORKER_SECRET),
      payments: Boolean(process.env.RAZORPAY_KEY_ID)
    }
  });
}
