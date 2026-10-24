import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { PREFS_COOKIE, htmlAttributes, parsePreferences } from "@/lib/preferences";
import "./globals.css";

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
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" }
  ]
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Theme comes from a cookie so the very first HTML is already in the right
  // colours: no white flash in dark mode, no layout shift.
  const prefs = parsePreferences((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <html lang="en" {...htmlAttributes(prefs)}>
      <body>{children}</body>
    </html>
  );
}
