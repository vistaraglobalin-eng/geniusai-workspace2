"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Box, Check, Cloud, HardDrive, Link2Off, PlugZap, X } from "lucide-react";
import type { DriveStatus } from "@/lib/integrations/status";
import { WebhookCard, type HookRow } from "./WebhookCard";

export function ConnectedApps({ drive, hooks, isAdmin, hooksMissing, dropboxReady, onedrive }: { drive: DriveStatus; hooks: HookRow[]; isAdmin: boolean; hooksMissing: boolean; dropboxReady: boolean; onedrive: { configured: boolean; connected: boolean; email: string | null } }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  async function disconnectOneDrive() {
    if (!window.confirm("Disconnect OneDrive? Files already copied stay where they are.")) return;
    setBusy(true);
    await fetch("/api/integrations/onedrive/disconnect", { method: "POST" }).catch(() => null);
    setBusy(false); startTransition(() => router.refresh());
  }
  async function disconnect() {
    if (!window.confirm("Disconnect Google Drive? Files already copied stay where they are.")) return;
    setBusy(true);
    await fetch("/api/integrations/google/disconnect", { method: "POST" }).catch(() => null);
    setBusy(false); startTransition(() => router.refresh());
  }
  return (
    <div className="apps-grid">
      <section className="panel-card app-card">
        <div className="app-card-head">
          <span className="app-icon lg"><HardDrive size={24} aria-hidden="true" /></span>
          <div><h2>Google Drive</h2><p>Bring files in from Drive, and save your PDFs, invoices and letters to a “GeniusAI Workspace” folder in your Drive.</p></div>
        </div>
        {drive.setupNeeded ? <p className="form-message error">Connected apps need a one-time database update first.</p>
          : !drive.configured ? <p className="lt-help">Not set up on this server yet. The app owner adds the Google login keys in Vercel.</p>
          : drive.connected ? (
            <div className="app-card-foot">
              <span className="app-connected"><Check size={15} aria-hidden="true" /> Connected{drive.email ? ` as ${drive.email}` : ""}</span>
              <button type="button" className="quiet-button with-icon danger-text" onClick={disconnect} disabled={busy}><Link2Off size={15} aria-hidden="true" /> Disconnect</button>
            </div>
          ) : (
            <div className="app-card-foot">
              <a className="primary-button" href="/api/integrations/google/start?next=/settings/apps"><PlugZap size={16} aria-hidden="true" /> Connect Google Drive</a>
              <span className="lt-help">GeniusAI only sees files you pick or that it creates — not the rest of your Drive.</span>
            </div>
          )}
      </section>
      {drive.checks.some((c) => !c.ok) && (drive.configured || drive.checks.some((c) => c.ok)) && (
        <section className="panel-card app-card">
          <h2 className="app-check-title">Google setup check</h2>
          <p className="lt-help">Something in the Google settings in Vercel needs fixing. Values are never shown here.</p>
          <ul className="app-checks">
            {drive.checks.map((c) => (
              <li key={c.label} className={c.ok ? "ok" : "bad"}>
                {c.ok ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
                <span><code>{c.label}</code>{c.ok ? " looks right" : ` — ${c.fix}`}</span>
              </li>
            ))}
          </ul>
          <p className="lt-help">After changing a value in Vercel, redeploy, then refresh this page.</p>
        </section>
      )}
      <section className="panel-card app-card">
        <div className="app-card-head">
          <span className="app-icon lg"><Cloud size={24} aria-hidden="true" /></span>
          <div><h2>OneDrive</h2><p>Browse your OneDrive (personal or work) to bring files in, and save files to a “GeniusAI Workspace” folder in it.</p></div>
        </div>
        {!onedrive.configured ? <p className="lt-help">Not set up on this server yet. The app owner adds the Microsoft app keys in Vercel.</p>
          : onedrive.connected ? (
            <div className="app-card-foot">
              <span className="app-connected"><Check size={15} aria-hidden="true" /> Connected{onedrive.email ? ` as ${onedrive.email}` : ""}</span>
              <button type="button" className="quiet-button with-icon danger-text" onClick={disconnectOneDrive} disabled={busy}><Link2Off size={15} aria-hidden="true" /> Disconnect</button>
            </div>
          ) : (
            <div className="app-card-foot"><a className="primary-button" href="/api/integrations/onedrive/start?next=/settings/apps"><PlugZap size={16} aria-hidden="true" /> Connect OneDrive</a></div>
          )}
      </section>
      <section className="panel-card app-card">
        <div className="app-card-head">
          <span className="app-icon lg"><Box size={24} aria-hidden="true" /></span>
          <div><h2>Dropbox</h2><p>Bring files in from Dropbox, and save any file to your Dropbox — using Dropbox&apos;s own windows, so GeniusAI never stores a Dropbox password or login.</p></div>
        </div>
        {dropboxReady
          ? <div className="app-card-foot"><span className="app-connected"><Check size={15} aria-hidden="true" /> Ready</span><span className="lt-help">Use “From Dropbox” on Files, and “Save to Dropbox” on any file&apos;s page.</span></div>
          : <p className="lt-help">Not set up on this server yet. The app owner adds the Dropbox app key in Vercel.</p>}
      </section>
      <WebhookCard provider="slack" hooks={hooks} isAdmin={isAdmin} setupNeeded={hooksMissing} />
      <WebhookCard provider="webhook" hooks={hooks} isAdmin={isAdmin} setupNeeded={hooksMissing} />
      <section className="panel-card app-card">
        <div className="app-card-head">
          <span className="app-icon lg"><ArrowRightLeft size={24} aria-hidden="true" /></span>
          <div><h2>Tally</h2><p>Export invoices, receipts and expenses to TallyPrime as ready-to-import files. No login needed.</p></div>
        </div>
        <div className="app-card-foot"><Link className="secondary-button" href="/tools/tally">Open Tally export</Link></div>
      </section>
      <section className="panel-card app-card muted">
        <div className="app-card-head">
          <span className="app-icon lg"><ArrowRightLeft size={24} aria-hidden="true" /></span>
          <div><h2>Zoho Books</h2><p>Send customers and invoices to Zoho Books.</p></div>
        </div>
        <p className="lt-help">Coming next.</p>
      </section>
    </div>
  );
}
