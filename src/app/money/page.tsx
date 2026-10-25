import type { Metadata } from "next";
import { ArrowRightLeft, BellRing, Building2, FileSpreadsheet, ReceiptText, ScrollText, Wallet, Receipt } from "lucide-react";
import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "Money · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default function MoneyPage() {
  return (
    <Hub area="money" path="/money" title="Money" tag="Get paid faster" intro="GST invoices, quotations, receipts, payment reminders and your expenses — in one place." sections={[
      { title: "Bill and collect", rows: [
        { href: "/tools/invoices/new?kind=invoice", title: "New invoice", text: "GST tax invoice with UPI QR code", Icon: ReceiptText, tint: "green" },
        { href: "/tools/invoices?tab=quotation", title: "Quotations", text: "Send a quote, convert it to an invoice later", Icon: ScrollText, tint: "green" },
        { href: "/tools/invoices?tab=receipt", title: "Receipts", text: "Payment receipts for money received", Icon: Receipt, tint: "green" },
        { href: "/tools/invoices/reminders", title: "Payment reminders", text: "WhatsApp, SMS or email in one tap", Icon: BellRing, tint: "red" },
        { href: "/tools/invoices", title: "All invoices", text: "To collect, overdue and paid", Icon: FileSpreadsheet, tint: "green" }
      ] },
      { title: "Spend", rows: [
        { href: "/tools/expenses", title: "Expenses", text: "Snap bills, see where money goes, export for your CA", Icon: Wallet, tint: "teal" }
      ] },
      { title: "Accounts", rows: [
        { href: "/tools/tally", title: "Export to Tally", text: "Invoices, receipts and expenses into TallyPrime", Icon: ArrowRightLeft, tint: "teal" }
      ] },
      { title: "Set up", rows: [
        { href: "/tools/invoices/settings", title: "Business details", text: "Name, GSTIN, logo, bank, UPI and signature", Icon: Building2, tint: "gray" }
      ] }
    ]} />
  );
}
