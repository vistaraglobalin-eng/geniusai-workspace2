import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CreditedTaskError } from "@/lib/ai/credited-task";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export function taskFailure(err: unknown) {
  if (err instanceof CreditedTaskError) return fail(err.status, err.code, err.message, err.creditsNeeded ? { creditsNeeded: err.creditsNeeded } : {});
  return fail(500, "failed", "Something went wrong. Please try again.");
}

export type AgreementRow = { id: string; workspace_id: string; title: string; template_key: string; content_md: string; current_version: number; status: string };

/** Loads an agreement the signed-in user can see (row-level security decides). */
export async function loadAgreement(supabase: SupabaseClient, id: string): Promise<AgreementRow | null> {
  if (!UUID.test(id)) return null;
  const { data } = await supabase
    .from("agreements")
    .select("id, workspace_id, title, template_key, content_md, current_version, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as AgreementRow | null) ?? null;
}

export function downloadName(title: string, ext: string): string {
  return `${title.replace(/[^\p{L}\p{N} ._-]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 80) || "agreement"}.${ext}`;
}
