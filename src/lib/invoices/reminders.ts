// Payment reminder messages for unpaid invoices (WhatsApp, SMS, email).

import { inr, showDate } from "./calc";

export type Tone = "gentle" | "firm" | "final";
export type Lang = "en" | "hi";
export type ReminderLog = { at: string; channel: string; tone: Tone };

export const TONES: { key: Tone; label: string; note: string }[] = [
  { key: "gentle", label: "Friendly", note: "Before or just after the due date" },
  { key: "firm", label: "Firm", note: "A week or more overdue" },
  { key: "final", label: "Final", note: "A month or more overdue" }
];

/** Days past the due date (negative = not due yet; null = no due date). */
export function daysOverdue(due: string | null, today: string): number | null {
  if (!due) return null;
  return Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(due + "T00:00:00Z")) / 86_400_000);
}

/** The tone that suits how late the payment is. */
export function suggestedTone(days: number | null): Tone {
  if (days === null || days < 7) return "gentle";
  return days < 30 ? "firm" : "final";
}

/** Phone number for wa.me / sms: Indian 10-digit mobiles get +91. Returns "" if it doesn't look like a phone. */
export function phoneDigits(raw: string): string {
  let d = (raw || "").replace(/[^\d+]/g, "");
  const plus = d.startsWith("+");
  d = d.replace(/\D/g, "");
  if (!plus) {
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (d.length === 10 && /^[6-9]/.test(d)) d = "91" + d;
  }
  return d.length >= 10 && d.length <= 15 ? d : "";
}

export type ReminderInput = {
  customer: string; number: string; total: number; balance: number; due: string | null; days: number | null;
  business: string; phone: string; upiId: string; bank: string;
};

const rs = (n: number) => `₹${inr(n, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2)}`;

export function reminderText(tone: Tone, lang: Lang, r: ReminderInput): string {
  const part = r.balance < r.total - 0.005;
  const who = r.customer.trim();
  const lines: string[] = [];
  if (lang === "hi") {
    const amt = part ? `${rs(r.balance)} (कुल ${rs(r.total)} में से बाकी)` : rs(r.balance);
    const when = r.due === null ? "" : r.days !== null && r.days > 0 ? ` (देय तिथि ${showDate(r.due)}, ${r.days} दिन पहले)` : r.days === 0 ? " (आज देय)" : ` (देय तिथि ${showDate(r.due)})`;
    lines.push(`नमस्ते${who ? ` ${who}` : ""} जी,`, "");
    if (tone === "gentle") lines.push(`यह एक विनम्र याद दिलाना है कि बिल ${r.number} की राशि ${amt}${when} बाकी है।`);
    else if (tone === "firm") lines.push(`हमारे रिकॉर्ड के अनुसार बिल ${r.number} की राशि ${amt}${when} अभी तक बाकी है। कृपया जल्द से जल्द भुगतान करें।`);
    else lines.push(`यह बिल ${r.number} के लिए अंतिम याद दिलाना है। राशि ${amt}${when} अभी तक बाकी है। कृपया 7 दिनों के भीतर भुगतान करें${r.phone ? ` या ${r.phone} पर हमसे बात करें` : ""}।`);
    if (r.upiId) lines.push("", `UPI से भुगतान करें: ${r.upiId}`);
    if (r.bank) lines.push(`बैंक: ${r.bank}`);
    lines.push("", tone === "gentle" ? "यदि आपने भुगतान कर दिया है, तो कृपया इस संदेश को अनदेखा करें। धन्यवाद!" : "भुगतान के बाद कृपया UTR/रेफरेंस नंबर भेजें। धन्यवाद।");
  } else {
    const amt = part ? `${rs(r.balance)} (balance of ${rs(r.total)})` : rs(r.balance);
    const when = r.due === null ? "is pending" : r.days !== null && r.days > 0 ? `was due on ${showDate(r.due)} (${r.days} day${r.days === 1 ? "" : "s"} ago)` : r.days === 0 ? "is due today" : `is due on ${showDate(r.due)}`;
    lines.push(`Hello${who ? ` ${who}` : ""},`, "");
    if (tone === "gentle") lines.push(`This is a friendly reminder that invoice ${r.number} for ${amt} ${when}.`);
    else if (tone === "firm") lines.push(`Our records show that invoice ${r.number} for ${amt} ${when} and is still unpaid. Kindly arrange the payment at the earliest.`);
    else lines.push(`This is a final reminder for invoice ${r.number}. The amount of ${amt} ${when} and is still unpaid. Please clear it within 7 days${r.phone ? `, or call us on ${r.phone} if there is any issue` : ""}.`);
    if (r.upiId) lines.push("", `Pay by UPI: ${r.upiId}`);
    if (r.bank) lines.push(`Bank: ${r.bank}`);
    lines.push("", tone === "gentle" ? "If you have already paid, please ignore this message. Thank you!" : "Please share the UTR / reference number once paid. Thank you.");
  }
  if (r.business.trim()) lines.push(`— ${r.business.trim()}`);
  return lines.join("\n");
}

export function reminderSubject(lang: Lang, number: string, business: string): string {
  return lang === "hi" ? `भुगतान अनुस्मारक: बिल ${number}` : `Payment reminder: invoice ${number}${business ? ` from ${business}` : ""}`;
}

/** Reminder history stored on the invoice (newest last, at most 20). */
export function readLog(extra: unknown): ReminderLog[] {
  const r = (extra as { reminders?: unknown } | null)?.reminders;
  return Array.isArray(r) ? (r as ReminderLog[]).filter((x) => x && typeof x.at === "string").slice(-20) : [];
}

export function sinceText(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
