// One catalogue of every ready-made document in the app, for the Templates library.
// Free = filled in with a form and made on your device; AI = drafted by AI (uses credits).

import { TEMPLATES as LETTERS } from "@/lib/letters/templates";
import { TEMPLATES as AGREEMENTS } from "@/lib/agreements/templates";

export type LibCategory = "HR & staff" | "Money & GST" | "Agreements" | "Property & rent" | "Business" | "Personal" | "Brand & careers";
export type LibItem = { id: string; title: string; text: string; href: string; category: LibCategory; kind: "free" | "ai"; tags: string };

const letterCat = (c: string, key: string): LibCategory =>
  key === "rent_receipt" ? "Property & rent" : key === "payment_demand" || key === "bank_request" ? "Money & GST" : c === "Staff" ? "HR & staff" : c === "Personal" ? "Personal" : "Business";
const agreementCat = (c: string): LibCategory => (c === "Property" ? "Property & rent" : c === "People" ? "HR & staff" : c === "Planning" ? "Business" : "Agreements");

export const LIBRARY: LibItem[] = [
  { id: "inv", title: "GST tax invoice", text: "CGST/SGST or IGST, HSN/SAC, UPI QR code", href: "/tools/invoices/new?kind=invoice", category: "Money & GST", kind: "free", tags: "bill gst invoice tax upi" },
  { id: "quote", title: "Quotation / estimate", text: "Send a quote, turn it into an invoice later", href: "/tools/invoices/new?kind=quotation", category: "Money & GST", kind: "free", tags: "estimate proforma quote" },
  { id: "receipt", title: "Payment receipt", text: "Acknowledge money received", href: "/tools/invoices/new?kind=receipt", category: "Money & GST", kind: "free", tags: "receipt payment received" },
  { id: "reminder", title: "Payment reminder", text: "WhatsApp, SMS or email in English or Hindi", href: "/tools/invoices/reminders", category: "Money & GST", kind: "free", tags: "overdue dues follow up hindi" },
  { id: "tally", title: "Tally export", text: "Ledgers and vouchers for TallyPrime, sales register for your CA", href: "/tools/tally", category: "Money & GST", kind: "free", tags: "tally accounts ca gstr sales register xml" },
  { id: "expense", title: "Expense report", text: "Monthly or financial-year report for your CA", href: "/tools/expenses", category: "Money & GST", kind: "free", tags: "expenses ca report itr" },
  ...LETTERS.map((t): LibItem => ({ id: `l-${t.key}`, title: t.label, text: t.note, href: `/tools/letters/${t.key}`, category: letterCat(t.category, t.key), kind: "free", tags: `letter ${t.category}` })),
  ...AGREEMENTS.map((t): LibItem => ({ id: `a-${t.key}`, title: t.title, text: t.description, href: `/tools/agreements/new?template=${t.key}`, category: agreementCat(t.category), kind: "ai", tags: `agreement contract ${t.category}` })),
  { id: "a-custom", title: "Any other agreement", text: "Describe it in your words — e.g. vendor, franchise, loan", href: "/tools/agreements/new", category: "Agreements", kind: "ai", tags: "contract custom mou vendor franchise loan" },
  { id: "card", title: "Visiting card", text: "Print-ready with QR for contact, UPI or website", href: "/tools/cards", category: "Brand & careers", kind: "free", tags: "business card qr" },
  { id: "letterhead", title: "Letterhead", text: "Your logo and details as PDF or Word", href: "/tools/cards?tab=letterhead", category: "Brand & careers", kind: "free", tags: "letter pad" },
  { id: "resume", title: "Resume / CV", text: "Clean, ATS-friendly resume", href: "/tools/career", category: "Brand & careers", kind: "free", tags: "cv biodata job" },
  { id: "ad", title: "Product photo & ad", text: "Clean backgrounds and sale posters", href: "/tools/photos", category: "Brand & careers", kind: "free", tags: "poster whatsapp status instagram" }
];

export const LIB_CATEGORIES: LibCategory[] = ["HR & staff", "Money & GST", "Agreements", "Property & rent", "Business", "Personal", "Brand & careers"];
