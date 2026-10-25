/** Tells the server something was saved, so connected Slack / Zapier get it. Never blocks or throws. */
export function announce(kind: "invoice" | "expense" | "file", id: string | null | undefined) {
  if (!id || typeof fetch === "undefined") return;
  void fetch("/api/integrations/emit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id }), keepalive: true }).catch(() => undefined);
}
