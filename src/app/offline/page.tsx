import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline · GeniusAI Workspace" };
// Static: this page is saved on your device so it can show without internet.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <span className="app-icon lg"><WifiOff size={26} aria-hidden="true" /></span>
      <h1>You&apos;re offline</h1>
      <p>This page needs internet. These tools work on your phone without it, if you&apos;ve opened them once before:</p>
      <ul>
        <li><Link href="/tools/scan">Scan &amp; convert</Link> — photos and IDs to HD PDF</li>
        <li><Link href="/tools/letters">Letters</Link> — offer letters, salary slips, rent receipts (download PDF or Word)</li>
        <li><Link href="/tools/cards">Cards &amp; letterhead</Link></li>
      </ul>
      <p className="lt-help">Saving to Files, invoices, signing and AI tools need internet. Your work will be there when you&apos;re back online.</p>
      <Link className="primary-button" href="/">Try again</Link>
    </main>
  );
}
