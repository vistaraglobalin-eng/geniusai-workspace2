import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Geist, Playfair_Display } from "next/font/google";
import { PREFS_COOKIE, htmlAttributes, parsePreferences } from "@/lib/preferences";
import { OfflineSupport } from "@/components/OfflineSupport";
import { Analytics } from "@/components/Analytics";
import { Suspense } from "react";
import "./globals.css";

// Self-hosted by Next.js (no request to Google at runtime): a clean sans for the interface
// and an editorial serif for page titles.
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "GeniusAI Workspace",
  description: "One workspace for documents, careers, creative work, invoices and contracts.",
  applicationName: "GeniusAI Workspace",
  // iPhone "Add to Home Screen": opens full screen with its own name and icon (src/app/apple-icon.png).
  appleWebApp: { capable: true, title: "GeniusAI", statusBarStyle: "default" },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" }
  ]
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Theme comes from a cookie so the very first HTML is already in the right
  // colours: no white flash in dark mode, no layout shift.
  const prefs = parsePreferences((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <html lang="en" {...htmlAttributes(prefs)} className={`${sans.variable} ${serif.variable}`}>
      <body>{children}<OfflineSupport /><Suspense fallback={null}><Analytics /></Suspense></body>
    </html>
  );
}
