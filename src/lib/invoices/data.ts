"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { docNumber, financialYear, type Party } from "./calc";
import type { DocKind, InvoiceDoc, InvoiceSettings } from "./render";

export { EMPTY_SETTINGS, EMPTY_PARTY, NEW_ITEM } from "./defaults";

export type SavedDoc = InvoiceDoc & { id: string; workspace_id: string; customer_id: string | null; total: number; related_id: string | null; file_id: string | null };
export type Customer = Party & { id: string };

export const tableMissing = (msg?: string) => !!msg && /does not exist|schema cache|relation .* does not exist/i.test(msg);

const prefixFor = (s: InvoiceSettings, kind: DocKind) => (kind === "invoice" ? s.prefix_invoice : kind === "quotation" ? s.prefix_quote : s.prefix_receipt) || "DOC";

/** Creates a document with the next number in its financial year (retries if two people save at once). */
export async function createDocument(
  supabase: SupabaseClient, workspaceId: string, s: InvoiceSettings,
  doc: InvoiceDoc & { customer_id: string | null; total: number; related_id?: string | null }
): Promise<{ id: string; number: string } | { error: string }> {
  const fy = financialYear(doc.issue_date);
  const { data: auth } = await supabase.auth.getUser();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: seq, error: seqErr } = await supabase.rpc("next_invoice_seq", { p_workspace: workspaceId, p_kind: doc.kind, p_fy: fy });
    if (seqErr || typeof seq !== "number") return { error: tableMissing(seqErr?.message) ? "setup" : "The next number couldn't be created. Please try again." };
    const number = docNumber(prefixFor(s, doc.kind), fy, seq);
    const { data, error } = await supabase.from("invoices").insert({
      workspace_id: workspaceId, created_by: auth.user?.id ?? null, kind: doc.kind, fy, seq, number,
      issue_date: doc.issue_date, due_date: doc.due_date || null, customer_id: doc.customer_id, customer: doc.customer,
      place_of_supply: doc.place_of_supply, gst: doc.gst, reverse_charge: doc.reverse_charge, items: doc.items, extra: doc.extra,
      notes: doc.notes, terms: doc.terms, total: doc.total, amount_paid: doc.amount_paid, status: doc.status, related_id: doc.related_id ?? null
    }).select("id, number").single();
    if (!error && data) return data as { id: string; number: string };
    if (error?.code !== "23505") return { error: tableMissing(error?.message) ? "setup" : "It couldn't be saved. Please try again." };
  }
  return { error: "It couldn't be saved. Please try again." };
}

export async function updateDocument(supabase: SupabaseClient, id: string, patch: Partial<SavedDoc>): Promise<string | null> {
  const allowed: (keyof SavedDoc)[] = ["issue_date", "due_date", "customer_id", "customer", "place_of_supply", "gst", "reverse_charge", "items", "extra", "notes", "terms", "total", "amount_paid", "status", "file_id"];
  const row: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) row[k] = (patch as Record<string, unknown>)[k];
  if ("due_date" in row && !row.due_date) row.due_date = null;
  const { error } = await supabase.from("invoices").update(row).eq("id", id);
  return error ? "It couldn't be saved. Please try again." : null;
}

export async function saveCustomer(supabase: SupabaseClient, workspaceId: string, c: Party): Promise<string | null> {
  const { data } = await supabase.from("invoice_customers").insert({ workspace_id: workspaceId, ...c }).select("id").single();
  return (data as { id: string } | null)?.id ?? null;
}
