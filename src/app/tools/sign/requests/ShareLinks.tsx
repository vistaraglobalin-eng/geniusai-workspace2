"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle, Share2 } from "lucide-react";

export type SignLink = { position: number; name: string; email: string | null; url: string; status?: string };

const STATUS: Record<string, string> = { pending: "Not opened", viewed: "Opened", signed: "Signed", declined: "Declined" };

/** One row per signer with ways to send their private link: share sheet, WhatsApp, email, copy. */
export function ShareLinks({ links, title, sender }: { links: SignLink[]; title: string; sender: string }) {
  const [copied, setCopied] = useState<number | null>(null);
  const text = (l: SignLink) => `Hi ${l.name}, ${sender} has sent you "${title}" to sign. Open your private signing link: ${l.url}`;

  async function copy(l: SignLink) {
    try { await navigator.clipboard.writeText(l.url); setCopied(l.position); setTimeout(() => setCopied(null), 2000); }
    catch { window.prompt("Copy this link", l.url); }
  }
  async function share(l: SignLink) {
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
    if (nav.share) { try { await nav.share({ title, text: `${sender} has sent you "${title}" to sign.`, url: l.url }); } catch { /* closed */ } }
    else copy(l);
  }

  return (
    <ul className="list-card sr-links">
      {links.map((l) => (
        <li key={l.position} className="sr-link">
          <div className="sr-link-head">
            <span className="sr-dot" style={{ background: SIGNER_COLORS[(l.position - 1) % SIGNER_COLORS.length] }} aria-hidden="true">{l.position}</span>
            <span className="list-text"><strong>{l.name}</strong><span>{l.email ?? "No email"}{l.status ? ` · ${STATUS[l.status] ?? l.status}` : ""}</span></span>
          </div>
          {l.status !== "signed" && l.status !== "declined" && (
            <div className="sr-link-actions">
              <button type="button" className="quiet-button with-icon" onClick={() => share(l)}><Share2 size={15} aria-hidden="true" /> Share</button>
              <a className="quiet-button with-icon" href={`https://wa.me/?text=${encodeURIComponent(text(l))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" /> WhatsApp</a>
              <a className="quiet-button with-icon" href={`mailto:${l.email ?? ""}?subject=${encodeURIComponent(`Please sign: ${title}`)}&body=${encodeURIComponent(text(l))}`}><Mail size={15} aria-hidden="true" /> Email</a>
              <button type="button" className="quiet-button with-icon" onClick={() => copy(l)}>
                {copied === l.position ? <><Check size={15} aria-hidden="true" /> Copied</> : <><Copy size={15} aria-hidden="true" /> Copy link</>}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export const SIGNER_COLORS = ["#4f46e5", "#e5392f", "#16a34a", "#ea7a00", "#8b3fd9", "#0e93a8", "#0a6cf0", "#c026d3", "#65a30d", "#b45309"];
