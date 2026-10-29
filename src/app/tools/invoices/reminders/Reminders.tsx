"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, ChevronDown, ChevronLeft, ChevronUp, PartyPopper } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ShareApps, mailHref } from "@/components/ShareApps";
import { ShareSheet } from "@/components/ShareSheet";
import { inr, r2, showDate } from "@/lib/invoices/calc";
import { buildInvoicePdf, type InvoiceSettings } from "@/lib/invoices/render";
import { updateDocument, type SavedDoc } from "@/lib/invoices/data";
import { TONES, daysOverdue, phoneDigits, readLog, reminderSubject, reminderText, sinceText, suggestedTone, type Lang, type ReminderLog, type Tone } from "@/lib/invoices/reminders";
import { VoiceButton, appendSpoken } from "@/components/VoiceButton";

type Filter = "overdue" | "all";

export function Reminders({ docs, settings, today, focusId }: { docs: SavedDoc[]; settings: InvoiceSettings; today: string; focusId: string | null }) {
  const [filter, setFilter] = useState<Filter>(focusId ? "all" : docs.some((d) => (daysOverdue(d.due_date, today) ?? -1) > 0) ? "overdue" : "all");
  const [logs, setLogs] = useState<Record<string, ReminderLog[]>>(() => Object.fromEntries(docs.map((d) => [d.id, readLog(d.extra)])));
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => { try { const l = localStorage.getItem("ga.reminder.lang"); if (l === "hi" || l === "en") setLang(l); } catch { /* ignore */ } }, []);
  function pickLang(l: Lang) { setLang(l); try { localStorage.setItem("ga.reminder.lang", l); } catch { /* ignore */ } }

  const rows = useMemo(() => docs
    .map((d) => ({ d, days: daysOverdue(d.due_date, today), balance: r2(Math.max(0, d.total - (d.amount_paid || 0))) }))
    .filter((x) => x.balance > 0 && (filter === "all" || (x.days ?? -1) > 0))
    .sort((a, b) => (a.d.id === focusId ? -1 : b.d.id === focusId ? 1 : (b.days ?? -9999) - (a.days ?? -9999))), [docs, filter, today, focusId]);
  const overdueTotal = docs.reduce((s, d) => s + ((daysOverdue(d.due_date, today) ?? -1) > 0 ? Math.max(0, d.total - (d.amount_paid || 0)) : 0), 0);

  return (
    <>
      <Link href="/tools/invoices" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Invoices</Link>
      <div className="welcome-row">
        <div>
          <h1>Payment reminders</h1>
          <p className="subtitle">Send a polite reminder on WhatsApp, SMS or email in one tap, with the amount, due date and your UPI ID.</p>
        </div>
      </div>
      <div className="rm-toolbar">
        <nav className="segmented" aria-label="Show">
          <button type="button" aria-selected={filter === "overdue"} onClick={() => setFilter("overdue")}>Overdue</button>
          <button type="button" aria-selected={filter === "all"} onClick={() => setFilter("all")}>All unpaid</button>
        </nav>
        <nav className="segmented" aria-label="Language">
          <button type="button" aria-selected={lang === "en"} onClick={() => pickLang("en")}>English</button>
          <button type="button" aria-selected={lang === "hi"} onClick={() => pickLang("hi")}>हिन्दी</button>
        </nav>
        {overdueTotal > 0 && <span className="rm-total">Overdue: <strong>₹ {inr(overdueTotal, 0)}</strong></span>}
      </div>
      {!settings.upi_id && (
        <p className="form-message inline">Tip: add your UPI ID in <Link href="/tools/invoices/settings">Business details</Link> so customers can pay straight from the reminder.</p>
      )}

      {rows.length === 0 ? (
        <section className="panel-card empty-state">
          <div className="empty-icon"><PartyPopper size={22} aria-hidden="true" /></div>
          <p>{filter === "overdue" ? "No overdue invoices. Nice work!" : "No unpaid invoices."}</p>
          {filter === "overdue" && docs.length > 0 && <button type="button" className="secondary-button" onClick={() => setFilter("all")}>Show all unpaid</button>}
        </section>
      ) : (
        <div className="rm-list">
          {rows.map(({ d, days, balance }) => (
            <ReminderCard key={d.id} doc={d} days={days} balance={balance} settings={settings} lang={lang} today={today}
              log={logs[d.id] ?? []} open={d.id === focusId || rows.length === 1}
              onSent={(entry) => setLogs((m) => ({ ...m, [d.id]: [...(m[d.id] ?? []), entry].slice(-20) }))} />
          ))}
        </div>
      )}
    </>
  );
}

function ReminderCard({ doc, days, balance, settings, lang, log, open: startOpen, onSent }: {
  doc: SavedDoc; days: number | null; balance: number; settings: InvoiceSettings; lang: Lang; today: string; log: ReminderLog[]; open: boolean;
  onSent: (e: ReminderLog) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(startOpen);
  const [tone, setTone] = useState<Tone>(suggestedTone(days));
  const bank = settings.account_number && settings.ifsc ? `${settings.bank_name ? settings.bank_name + ", " : ""}A/c ${settings.account_number}, IFSC ${settings.ifsc}` : "";
  const auto = reminderText(tone, lang, {
    customer: doc.customer.name, number: doc.number, total: doc.total, balance, due: doc.due_date, days,
    business: settings.business_name, phone: settings.phone, upiId: settings.upi_id, bank
  });
  const [edited, setEdited] = useState<string | null>(null);
  useEffect(() => setEdited(null), [tone, lang]);
  const text = edited ?? auto;
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const last = log[log.length - 1];

  const phone = phoneDigits(doc.customer.phone);
  const email = doc.customer.email.trim();

  async function record(channel: string) {
    const entry: ReminderLog = { at: new Date().toISOString(), channel, tone };
    onSent(entry);
    const reminders = [...log, entry].slice(-20);
    await updateDocument(supabase, doc.id, { extra: { ...doc.extra, reminders } });
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(text); setNote("Message copied."); } catch { setNote("Couldn't copy. Select the text and copy it."); }
  }

  const lateLabel = days === null ? "No due date" : days > 0 ? `${days} day${days === 1 ? "" : "s"} overdue` : days === 0 ? "Due today" : `Due in ${-days} day${days === -1 ? "" : "s"}`;
  const tone2 = days !== null && days >= 30 ? "bad" : days !== null && days > 0 ? "warn" : "";

  return (
    <section className={`panel-card rm-card${open ? " open" : ""}`}>
      <button type="button" className="rm-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="list-text">
          <strong>{doc.customer.name || "—"}</strong>
          <span>{doc.number}{doc.due_date ? ` · due ${showDate(doc.due_date)}` : ""}{last ? ` · reminded ${sinceText(last.at)}` : ""}</span>
        </span>
        <span className="inv-amount">
          <strong>₹ {inr(balance)}</strong>
          <span className={`rm-late ${tone2}`}>{lateLabel}</span>
        </span>
        {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
      {open && (
        <div className="rm-body">
          <nav className="segmented rm-tones" aria-label="Tone">
            {TONES.map((t) => <button key={t.key} type="button" aria-selected={tone === t.key} onClick={() => setTone(t.key)} title={t.note}>{t.label}</button>)}
          </nav>
          <textarea className="text-input rm-text" rows={12} value={text} onChange={(e) => setEdited(e.target.value)} aria-label="Reminder message" lang={lang} />
          <VoiceButton className="voice-row" onText={(s) => setEdited(appendSpoken(text, s))} />
          {edited !== null && <button type="button" className="quiet-button rm-reset" onClick={() => setEdited(null)}>Reset message</button>}
          {!phone && <p className="rm-hint">No mobile number saved for this customer — WhatsApp and SMS will ask you to pick the contact. <Link href={`/tools/invoices/${doc.id}`}>Add it on the invoice</Link>.</p>}
          <ShareApps label="Send reminder with" items={[
            { kind: "whatsapp", href: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, onClick: () => { void record("WhatsApp"); } },
            { kind: "sms", href: `sms:${phone ? "+" + phone : ""}?&body=${encodeURIComponent(text)}`, onClick: () => { void record("SMS"); } },
            { kind: "email", href: mailHref(email, reminderSubject(lang, doc.number, settings.business_name), text), onClick: () => { void record("email"); } },
            { kind: "attach", label: "PDF + text", onClick: () => { void copyText(); setSharing(true); void record("PDF"); } },
            { kind: "copy", label: "Copy text", onClick: () => { void copyText(); } }
          ]} />
          {note && <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {note}{sharing ? " Paste it with the PDF." : ""}</p>}
          {log.length > 0 && (
            <p className="rm-log"><BellRing size={13} aria-hidden="true" /> {log.length} reminder{log.length === 1 ? "" : "s"} sent · last {sinceText(log[log.length - 1].at)} by {log[log.length - 1].channel}</p>
          )}
          <Link className="quiet-button with-icon" href={`/tools/invoices/${doc.id}`}>Open invoice / record payment</Link>
        </div>
      )}
      {sharing && (
        <ShareSheet
          source={{ name: `${doc.number.replace(/\//g, "-")} ${doc.customer.name}.pdf`.trim(), mime: "application/pdf", getBlob: () => buildInvoicePdf(doc, settings) }}
          onClose={() => setSharing(false)}
        />
      )}
    </section>
  );
}
