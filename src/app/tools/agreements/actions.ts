"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/agreements/server";

// Manual edits, restores and deletes run as the signed-in user, so row-level
// security and the column grants decide what's allowed. Version history is
// written by the database trigger, not here.

export type ActionResult = { ok: true; version?: number } | { ok: false; message: string };

const MAX_CONTENT = 200_000;

export async function saveAgreement(input: { id: string; title: string; content: string; note?: string }): Promise<ActionResult> {
  if (!UUID.test(input.id)) return { ok: false, message: "That agreement isn't available." };
  const title = input.title.trim().slice(0, 160);
  if (!title) return { ok: false, message: "Give the agreement a title." };
  if (input.content.length > MAX_CONTENT) return { ok: false, message: "The agreement is too long (200,000 characters max)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agreements")
    .update({ title, content_md: input.content, last_change_source: "manual", last_change_note: input.note?.trim().slice(0, 300) || "Edited" })
    .eq("id", input.id)
    .is("deleted_at", null)
    .select("current_version")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Your changes couldn't be saved. Please try again." };
  revalidatePath(`/tools/agreements/${input.id}`);
  return { ok: true, version: (data as { current_version: number }).current_version };
}

export async function setAgreementStatus(id: string, status: "draft" | "final"): Promise<ActionResult> {
  if (!UUID.test(id) || (status !== "draft" && status !== "final")) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("agreements").update({ status }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "The status couldn't be changed." };
  revalidatePath(`/tools/agreements/${id}`);
  revalidatePath("/tools/agreements");
  return { ok: true };
}

export async function restoreVersion(id: string, version: number): Promise<ActionResult> {
  if (!UUID.test(id) || !Number.isInteger(version) || version < 1) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data: v } = await supabase.from("agreement_versions").select("content_md").eq("agreement_id", id).eq("version", version).maybeSingle();
  if (!v) return { ok: false, message: "That version isn't available." };
  const { data, error } = await supabase
    .from("agreements")
    .update({ content_md: (v as { content_md: string }).content_md, last_change_source: "restore", last_change_note: `Restored version ${version}` })
    .eq("id", id)
    .is("deleted_at", null)
    .select("current_version")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "That version couldn't be restored." };
  revalidatePath(`/tools/agreements/${id}`);
  return { ok: true, version: (data as { current_version: number }).current_version };
}

export async function deleteAgreement(id: string): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, message: "Invalid request." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("agreements").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: "The agreement couldn't be deleted." };
  revalidatePath("/tools/agreements");
  return { ok: true };
}
