"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

/** Counts page views (and a finished onboarding). Does nothing unless analytics is configured. */
export function Analytics() {
  const pathname = usePathname();
  const params = useSearchParams();
  const welcome = params.get("welcome") === "1";

  useEffect(() => {
    if (!pathname) return;
    track("$pageview");
    if (welcome) {
      track("onboarding_completed");
      // Drop the marker so a reload doesn't count it again.
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, [pathname, welcome]);

  return null;
}
