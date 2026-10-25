import type { NextConfig } from "next";

// Baseline security headers for every response. A full Content-Security-Policy
// with nonces is planned (docs/PRODUCT_SPEC.md §7).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")' },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Payment methods (UPI, netbanking) open popups that must talk back to Razorpay Checkout.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Loaded at runtime by the Document Genius API route instead of being bundled.
  serverExternalPackages: ["mammoth"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must always be re-checked so updates reach people quickly.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] }
    ];
  }
};

export default nextConfig;
