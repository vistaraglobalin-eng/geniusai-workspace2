"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, MessageSquare, Send, Trash2, Webhook, Zap } from "lucide-react";
import { DEFAULT_EVENTS, EVENTS } from "@/lib/integrations/events";

export type HookRow = { id: string; provider: "slack" | "webhook"; name: string; url_hint: string | null; events: string[]; last_status: string | null; last_at: string | null };

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");

const COPY = {
  slack: {
    title: "Slack", Icon: MessageSquare,
    blurb: "Get a message in a Slack channel when an invoice is paid, a document is signed and more. Share any file to Slack from its page.",
    placeholder: "https://hooks.slack.com/services/…",
    steps: ["Open api.slack.com/apps → Create New App → From scratch. Name it GeniusAI and pick your Slack workspace.", "In the app, open Incoming Webhooks → turn it On → Add New Webhook to Workspace → choose the channel → Allow.", "Copy the Webhook URL and paste it below."],
    namePlaceholder: "e.g. #accounts channel"
  },
  webhook: {
    title: "Zapier (or Make, Pabbly)", Icon: Zap,
    blurb: "Send invoices, payments, expenses and signed documents to 7,000+ apps — Google Sheets, Tally, WhatsApp, CRM — with Zapier, Make or Pabbly Connect.",
    placeholder: "https://hooks.zapier.com/hooks/catch/…",
    steps: ["In Zapier, create a Zap. For the trigger choose “Webhooks by Zapier” → “Catch Hook” → Continue.", "Copy the webhook URL Zapier shows and paste it below. We send a test so Zapier can see the fields.", "Back in Zapier, click Test trigger, then add the action you want (e.g. add a row in Google Sheets)."],
    namePlaceholder: "e.g. Invoices to Google Sheets"
  }
} as const;

export function WebhookCard({ provider, hooks, isAdmin, setupNeeded }: { provider: "slack" | "webhook"; hooks: HookRow[]; isAdmin: boolean; setupNeeded: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const c = COPY[provider];
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState(""), [name, setName] = useState("");
  const [events, setEvents] = useState<string[]>([...DEFAULT_EVENTS[provider]]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const mine = hooks.filter((h) => h.provider === provider);
  const refresh = () => startTransition(() => router.refresh());

  async function call(path: string, method: string, body?: object): Promise<boolean> {
    setMsg(null);
    try {
      const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) { setMsg({ ok: false, text: d.message ?? "That didn't work. Please try again." }); return false; }
      return true;
    } catch { setMsg({ ok: false, text: "The connection dropped. Please try again." }); return false; }
  }
  async function add() {
    setBusy("add");
    if (await call("/api/integrations/hooks", "POST", { provider, url, name, events })) {
      setAdding(false); setUrl(""); setName(""); setMsg({ ok: true, text: provider === "slack" ? "Connected — check Slack for the test message." : "Connected — a test was sent. Now click “Test trigger” in Zapier." }); refresh();
    }
    setBusy(null);
  }
  const Toggles = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
    <fieldset className="hook-events"><legend>Send these updates</legend>
      {EVENTS.map((e) => (
        <label key={e.key} className="check-row"><input type="checkbox" checked={value.includes(e.key)} onChange={() => onChange(value.includes(e.key) ? value.filter((x) => x !== e.key) : [...value, e.key])} /> {e.label}</label>
      ))}
    </fieldset>
  );

  return (
    <section className="panel-card app-card">
      <div className="app-card-head">
        <span className="app-icon lg"><c.Icon size={24} aria-hidden="true" /></span>
        <div><h2>{c.title}</h2><p>{c.blurb}</p></div>
      </div>
      {setupNeeded ? <p className="form-message error">Connections need a one-time database update first.</p> : (
        <>
          {mine.length > 0 && (
            <ul className="hook-list">
              {mine.map((h) => (
                <li key={h.id}>
                  <div className="hook-row">
                    <span className="hook-name"><Check size={14} aria-hidden="true" /> <strong>{h.name}</strong><small>{h.url_hint}</small></span>
                    <small className="hook-status">{h.last_status}{h.last_at ? ` · ${when(h.last_at)}` : ""}</small>
                  </div>
                  {isAdmin && (
                    <div className="hook-actions">
                      <button type="button" className="quiet-button with-icon" disabled={!!busy} onClick={async () => { setBusy(h.id); if (await call(`/api/integrations/hooks/${h.id}`, "POST")) { setMsg({ ok: true, text: "Test sent." }); refresh(); } setBusy(null); }}><Send size={14} aria-hidden="true" /> Send test</button>
                      <button type="button" className="quiet-button with-icon" onClick={() => { setEditing(editing === h.id ? null : h.id); setEditEvents(h.events); }}><ChevronDown size={14} aria-hidden="true" /> Updates ({h.events.length})</button>
                      <button type="button" className="quiet-button with-icon danger-text" disabled={!!busy} onClick={async () => { if (!window.confirm(`Remove “${h.name}”?`)) return; setBusy(h.id); if (await call(`/api/integrations/hooks/${h.id}`, "DELETE")) refresh(); setBusy(null); }}><Trash2 size={14} aria-hidden="true" /> Remove</button>
                    </div>
                  )}
                  {editing === h.id && (
                    <div className="hook-edit">
                      <Toggles value={editEvents} onChange={setEditEvents} />
                      <button type="button" className="primary-button" disabled={!!busy} onClick={async () => { setBusy(h.id); if (await call(`/api/integrations/hooks/${h.id}`, "PATCH", { events: editEvents })) { setEditing(null); setMsg({ ok: true, text: "Saved." }); refresh(); } setBusy(null); }}>Save</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {msg && <p className={`form-message ${msg.ok ? "success" : "error"}`} role="status">{msg.text}</p>}
          {!isAdmin ? <p className="lt-help">Ask a workspace owner or admin to connect {c.title}.</p> : adding ? (
            <form className="hook-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <ol className="tx-steps">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              <label className="field">Webhook link<input className="text-input" type="url" inputMode="url" autoComplete="off" required placeholder={c.placeholder} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
              <label className="field">Name (optional)<input className="text-input" maxLength={80} placeholder={c.namePlaceholder} value={name} onChange={(e) => setName(e.target.value)} /></label>
              <Toggles value={events} onChange={setEvents} />
              <div className="app-card-foot">
                <button type="submit" className="primary-button" disabled={busy === "add" || !url.trim()}>{busy === "add" ? "Connecting…" : "Connect & send test"}</button>
                <button type="button" className="quiet-button" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="app-card-foot">
              <button type="button" className={mine.length ? "secondary-button with-icon" : "primary-button with-icon"} onClick={() => { setAdding(true); setMsg(null); }}><Webhook size={16} aria-hidden="true" /> {mine.length ? "Add another" : `Connect ${provider === "slack" ? "Slack" : "Zapier"}`}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
