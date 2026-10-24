import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_SETTINGS } from "./defaults";
import type { InvoiceSettings } from "./render";
import type { Customer, SavedDoc } from "./data";

export async function loadInvoiceData(supabase: SupabaseClient, workspaceId: string) {
  const [{ data: s, error }, { data: c }] = await Promise.all([
    supabase.from("invoice_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("invoice_customers").select("id, name, address, state_code, gstin, phone, email").eq("workspace_id", workspaceId).order("name").limit(500)
  ]);
  const setupNeeded = !!error && /does not exist|schema cache/i.test(error.message);
  const settings: InvoiceSettings = { ...EMPTY_SETTINGS, ...((s ?? {}) as Partial<InvoiceSettings>) };
  return { settings, customers: (c ?? []) as Customer[], setupNeeded };
}

export async function loadDoc(supabase: SupabaseClient, id: string): Promise<SavedDoc | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const d = data as SavedDoc & { total: string | number; amount_paid: string | number };
  return { ...d, total: Number(d.total), amount_paid: Number(d.amount_paid), items: (d.items ?? []).map((i) => ({ ...i })) };
}
