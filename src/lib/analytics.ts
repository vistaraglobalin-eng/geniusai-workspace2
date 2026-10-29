// Privacy-friendly product analytics (PostHog), browser only.
//
// - Off unless NEXT_PUBLIC_POSTHOG_KEY is set, and off when the browser sends "Do Not Track".
// - No cookies and no personal data: a random ID kept in this browser, page paths with IDs and
//   private link codes replaced by ":id", and event names with a few plain properties.
// - Events go straight to PostHog's capture API, so no extra package is needed.

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
// PostHog EU or US cloud, or your own instance. Default: EU.
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/+$/, "");
const ID_KEY = "gai_anon_id";

export type AnalyticsEvent =
  | "$pageview"
  | "file_uploaded"
  | "ai_task_completed"
  | "ai_task_failed"
  | "compare_completed"
  | "language_changed"
  | "voice_input_used"
  | "space_shared"
  | "question_paper_exported"
  | "onboarding_completed";

type Props = Record<string, string | number | boolean | null | undefined>;

const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{20,}|\d+)$/i;

/** Replaces IDs and private link codes in a path, so no record or signer can be identified. */
export function cleanPath(pathname: string): string {
  const parts = pathname.split("?")[0].split("#")[0].split("/");
  return parts
    .map((seg, i) => {
      if (!seg) return seg;
      // Public signing links (/s/<token>) and invite links carry secrets in the path.
      if (i > 0 && ["s", "invite", "join"].includes(parts[i - 1]) && seg.length >= 8) return ":id";
      return ID_SEGMENT.test(seg) ? ":id" : seg;
    })
    .join("/") || "/";
}

export function analyticsEnabled(): boolean {
  if (!KEY || typeof window === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return false;
  return true;
}

function anonymousId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    // Private mode or storage blocked: one ID per page load.
    return (window as unknown as { __gaiAnon?: string }).__gaiAnon ??= crypto.randomUUID();
  }
}

/** Sends one event. Never throws and never blocks the page. */
export function track(event: AnalyticsEvent, properties: Props = {}): void {
  if (!analyticsEnabled()) return;
  try {
    const clean: Props = {};
    for (const [k, v] of Object.entries(properties)) {
      if (v === undefined) continue;
      clean[k] = typeof v === "string" ? v.slice(0, 120) : v;
    }
    const body = JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: anonymousId(),
      timestamp: new Date().toISOString(),
      properties: {
        ...clean,
        $current_url: location.origin + cleanPath(location.pathname),
        $pathname: cleanPath(location.pathname),
        $host: location.host,
        $screen_width: window.innerWidth,
        $process_person_profile: false
      }
    });
    void fetch(`${HOST}/i/v0/e/`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "omit" })
      .catch(() => undefined);
  } catch {
    /* analytics must never break the app */
  }
}
