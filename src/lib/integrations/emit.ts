import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inr, showDate } from "@/lib/invoices/calc";
import { deliver } from "./webhooks";

const rs = (n: number) => `₹${inr(Number(n) || 0)}`;

/** Invoices, quotations and receipts: "created" once, and "paid" once when fully paid. */
export async function emitInvoice(admin: SupabaseClient, id: string, origin: string) {
  const { data } = await admin.from("invoices").select("id, workspace_id, kind, number, issue_date, due_date, customer, total, amount_paid, status, extra").eq("id", id).maybeSingle();
  if (!data) return;
  const d = data as { id: string; workspace_id: string; kind: "invoice" | "quotation" | "receipt"; number: string; issue_date: string; due_date: string | null; customer: { name?: string; gstin?: string } | null;
    total: number; amount_paid: number; status: string; extra: { receiptAmount?: number; paymentMode?: string; against?: string } | null };
  if (d.status === "draft" || d.status === "cancelled") return;
  const customer = d.customer?.name?.trim() || "a customer", link = `${origin}/tools/invoices/${d.id}`;
  const fields = { number: d.number, customer, customer_gstin: d.customer?.gstin ?? null, date: d.issue_date, due_date: d.due_date, total: Number(d.total), amount_paid: Number(d.amount_paid), status: d.status, link };
  if (d.kind === "receipt") {
    const amt = Number(d.extra?.receiptAmount ?? d.total);
    await deliver(admin, { workspaceId: d.workspace_id, event: "receipt.created", objectId: d.id, data: {
      title: `${rs(amt)} received from ${customer}`, lines: [`Receipt ${d.number} · ${showDate(d.issue_date)}${d.extra?.paymentMode ? ` · ${d.extra.paymentMode}` : ""}${d.extra?.against ? ` · against ${d.extra.against}` : ""}`], link,
      fields: { ...fields, amount: amt, payment_mode: d.extra?.paymentMode ?? null, against: d.extra?.against ?? null } } });
    return;
  }
  const word = d.kind === "quotation" ? "Quotation" : "Invoice";
  await deliver(admin, { workspaceId: d.workspace_id, event: d.kind === "quotation" ? "quotation.created" : "invoice.created", objectId: d.id, data: {
    title: `${word} ${d.number} for ${customer}: ${rs(d.total)}`, lines: [`Dated ${showDate(d.issue_date)}${d.due_date ? ` · due ${showDate(d.due_date)}` : ""}`], link, fields } });
  if (d.kind === "invoice" && (d.status === "paid" || (Number(d.total) > 0 && Number(d.amount_paid) >= Number(d.total)))) {
    await deliver(admin, { workspaceId: d.workspace_id, event: "invoice.paid", objectId: d.id, data: {
      title: `Invoice ${d.number} paid: ${rs(d.total)} from ${customer}`, lines: [], link, fields } });
  }
}

export async function emitExpense(admin: SupabaseClient, id: string, origin: string) {
  const { data } = await admin.from("expenses").select("id, workspace_id, spent_on, amount, gst_amount, category, vendor, payment_mode, note").eq("id", id).maybeSingle();
  if (!data) return;
  const e = data as { id: string; workspace_id: string; spent_on: string; amount: number; gst_amount: number; category: string; vendor: string; payment_mode: string; note: string };
  await deliver(admin, { workspaceId: e.workspace_id, event: "expense.added", objectId: e.id, data: {
    title: `Expense ${rs(e.amount)} · ${e.category}`, lines: [[e.vendor, e.payment_mode, showDate(e.spent_on)].filter(Boolean).join(" · ")], link: `${origin}/tools/expenses?m=${e.spent_on.slice(0, 7)}`,
    fields: { date: e.spent_on, amount: Number(e.amount), gst: Number(e.gst_amount), category: e.category, vendor: e.vendor, payment_mode: e.payment_mode, note: e.note } } });
}

export async function emitFile(admin: SupabaseClient, id: string, origin: string) {
  const { data } = await admin.from("files").select("id, workspace_id, original_filename, mime_type, byte_size, deleted_at").eq("id", id).maybeSingle();
  if (!data) return;
  const f = data as { id: string; workspace_id: string; original_filename: string; mime_type: string; byte_size: number; deleted_at: string | null };
  if (f.deleted_at) return;
  await deliver(admin, { workspaceId: f.workspace_id, event: "file.added", objectId: f.id, data: {
    title: `New file: ${f.original_filename}`, lines: [], link: `${origin}/files/${f.id}`,
    fields: { name: f.original_filename, type: f.mime_type, size_bytes: Number(f.byte_size) } } });
}

export async function emitSignature(admin: SupabaseClient, requestId: string, outcome: "completed" | "declined", origin: string, who?: { name: string; reason?: string | null }) {
  const { data } = await admin.from("signature_requests").select("id, workspace_id, title, document_name").eq("id", requestId).maybeSingle();
  if (!data) return;
  const r = data as { id: string; workspace_id: string; title: string; document_name: string };
  const link = `${origin}/tools/sign/requests/${r.id}`;
  if (outcome === "completed") {
    const { data: s } = await admin.from("signature_signers").select("name").eq("request_id", r.id).order("position");
    const names = ((s ?? []) as { name: string }[]).map((x) => x.name);
    await deliver(admin, { workspaceId: r.workspace_id, event: "signature.completed", objectId: r.id, data: {
      title: `Signed by everyone: ${r.document_name}`, lines: [names.join(", ")], link, fields: { title: r.title, document: r.document_name, signers: names.join(", ") } } });
  } else {
    await deliver(admin, { workspaceId: r.workspace_id, event: "signature.declined", objectId: r.id, data: {
      title: `${who?.name ?? "A signer"} declined to sign ${r.document_name}`, lines: who?.reason ? [`“${who.reason}”`] : [], link,
      fields: { title: r.title, document: r.document_name, declined_by: who?.name ?? null, reason: who?.reason ?? null } } });
  }
}
