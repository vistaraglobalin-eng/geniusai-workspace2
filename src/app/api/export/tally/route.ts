import { type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { loadInvoiceData } from "@/lib/invoices/server";
import { computeTotals, r2, stateName } from "@/lib/invoices/calc";
import { buildMasters, buildVouchers, ledgerName, type TallyExpense, type TallyInvoice } from "@/lib/tally";
import { fail } from "@/lib/agreements/server";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: string | null, max: number, fallback: string) => (v ?? "").replace(/[\r\n\t<>&"]+/g, " ").trim().slice(0, max) || fallback;
const csvCell = (v: string | number) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Downloads Tally XML (masters or vouchers) or a GST sales register (CSV) for a date range. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const from = q.get("from") ?? "", to = q.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) return fail(400, "bad_dates", "Choose a valid date range.");
  const part = q.get("part");
  if (part !== "masters" && part !== "vouchers" && part !== "sales_csv") return fail(400, "bad_request", "Invalid request.");
  const withInvoices = q.get("inv") !== "0", withExpenses = q.get("exp") !== "0", withDrafts = q.get("drafts") === "1";

  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) return fail(401, "not_signed_in", "Please sign in again.");
  if (!ctx.workspace) return fail(400, "no_workspace", "Choose a workspace first.");
  const ws = ctx.workspace.id;
  const { settings } = await loadInvoiceData(supabase, ws);

  const [invRes, expRes] = await Promise.all([
    withInvoices || part === "sales_csv"
      ? supabase.from("invoices").select("kind, number, issue_date, customer, place_of_supply, gst, items, total, status, extra")
          .eq("workspace_id", ws).in("kind", part === "sales_csv" ? ["invoice"] : ["invoice", "receipt"]).gte("issue_date", from).lte("issue_date", to)
          .neq("status", "cancelled").order("issue_date").order("number").limit(5000)
      : Promise.resolve({ data: [], error: null }),
    withExpenses && part !== "sales_csv"
      ? supabase.from("expenses").select("spent_on, amount, gst_amount, category, vendor, payment_mode, vendor_gstin, note")
          .eq("workspace_id", ws).gte("spent_on", from).lte("spent_on", to).order("spent_on").limit(10000)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (invRes.error && withInvoices) return fail(500, "failed", "Invoices couldn't be loaded.");
  const invoices = ((invRes.data ?? []) as TallyInvoice[])
    .filter((i) => withDrafts || i.status !== "draft")
    .map((i) => ({ ...i, total: Number(i.total), items: i.items ?? [], extra: i.extra ?? {}, customer: i.customer ?? {} }));
  const expenses = ((expRes.error ? [] : expRes.data ?? []) as TallyExpense[]).map((e) => ({ ...e, amount: Number(e.amount), gst_amount: Number(e.gst_amount) }));
  const base = `${(settings.business_name || ctx.workspace.name).replace(/[^\w -]+/g, "").trim().slice(0, 40) || "Export"} ${from} to ${to}`;

  if (part === "sales_csv") {
    const head = ["Invoice no.", "Date", "Customer", "Customer GSTIN", "Place of supply", "Taxable value", "CGST", "SGST", "IGST", "Round off", "Invoice total", "Status"];
    const rows = invoices.map((i) => {
      const t = computeTotals(i.items, { gst: i.gst, sellerState: settings.state_code, placeOfSupply: i.place_of_supply || settings.state_code, roundOff: i.extra?.roundOff !== false });
      return [i.number, i.issue_date, ledgerName(i.customer?.name ?? ""), (i.customer?.gstin ?? "").toUpperCase(), stateName(i.place_of_supply) || "", t.taxable, t.cgst, t.sgst, t.igst, t.roundOff, t.total, i.status];
    });
    const sum = (k: number) => r2(rows.reduce((s, r) => s + Number(r[k]), 0));
    rows.push(["Total", "", "", "", "", sum(5), sum(6), sum(7), sum(8), sum(9), sum(10), ""]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="Sales register ${base}.csv"`, "cache-control": "no-store" } });
  }

  const o = { company: clean(q.get("company"), 100, ""), sellerState: settings.state_code, bankLedger: clean(q.get("bank"), 60, "Bank Account"), cashLedger: clean(q.get("cash"), 60, "Cash") };
  const r = part === "masters" ? buildMasters(invoices, expenses, o) : buildVouchers(invoices, expenses, o);
  return new Response(r.xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${part === "masters" ? "1 Tally masters" : "2 Tally vouchers"} ${base}.xml"`,
      "x-record-count": String(r.count), "cache-control": "no-store"
    }
  });
}
