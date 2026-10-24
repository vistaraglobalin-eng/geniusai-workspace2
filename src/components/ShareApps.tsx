"use client";

import type { ReactNode } from "react";
import { Check, Copy, Download, Mail, MessageCircle, MessageSquare, Paperclip, Share2 } from "lucide-react";

export type ShareAppKind = "share" | "whatsapp" | "sms" | "email" | "copy" | "copied" | "attach" | "download";

const LOOK: Record<ShareAppKind, { label: string; icon: ReactNode }> = {
  share: { label: "Share", icon: <Share2 size={22} aria-hidden="true" /> },
  whatsapp: { label: "WhatsApp", icon: <MessageCircle size={23} aria-hidden="true" /> },
  sms: { label: "Message", icon: <MessageSquare size={22} aria-hidden="true" /> },
  email: { label: "Email", icon: <Mail size={22} aria-hidden="true" /> },
  copy: { label: "Copy link", icon: <Copy size={21} aria-hidden="true" /> },
  copied: { label: "Copied", icon: <Check size={23} aria-hidden="true" /> },
  attach: { label: "Link + PDF", icon: <Paperclip size={22} aria-hidden="true" /> },
  download: { label: "Download", icon: <Download size={22} aria-hidden="true" /> }
};

export type ShareAppItem = { kind: ShareAppKind; label?: string; href?: string; onClick?: () => void; disabled?: boolean };

/** iPhone-style row of colourful app tiles (share sheet look). */
export function ShareApps({ items, label = "Send with" }: { items: ShareAppItem[]; label?: string }) {
  return (
    <div className="share-apps" role="group" aria-label={label}>
      {items.map((it) => {
        const look = LOOK[it.kind];
        const inner = (<><span className={`share-app-icon ${it.kind}`}>{look.icon}</span><span className="share-app-label">{it.label ?? look.label}</span></>);
        return it.href
          ? <a key={it.kind} className="share-app" href={it.href} target={it.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" onClick={it.onClick}>{inner}</a>
          : <button key={it.kind} type="button" className="share-app" onClick={it.onClick} disabled={it.disabled}>{inner}</button>;
      })}
    </div>
  );
}

export const waHref = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export const smsHref = (text: string) => `sms:?&body=${encodeURIComponent(text)}`;
export const mailHref = (to: string, subject: string, body: string) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
