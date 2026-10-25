"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Registers the service worker (production only) and shows a small notice while offline. */
export function OfflineSupport() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production" && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    // Signing out also clears page copies kept for offline use.
    const onSubmit = (e: Event) => {
      const f = e.target as HTMLFormElement | null;
      if (f?.action?.endsWith("/auth/signout")) navigator.serviceWorker?.controller?.postMessage("clear-private");
    };
    document.addEventListener("submit", onSubmit, true);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); document.removeEventListener("submit", onSubmit, true); };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-bar" role="status"><WifiOff size={15} aria-hidden="true" /> You&apos;re offline. Scan, Letters and Cards still work; other tools need internet.</div>
  );
}
