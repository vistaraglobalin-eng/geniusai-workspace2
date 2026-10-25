import type { MetadataRoute } from "next";

/** Lets people add GeniusAI Workspace to their home screen as an app (Android and desktop; iPhone uses the apple-icon). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GeniusAI Workspace",
    short_name: "GeniusAI",
    description: "Documents, PDFs, signatures, invoices, product photos and resumes in one private workspace.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffaf6",
    theme_color: "#fffaf6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
