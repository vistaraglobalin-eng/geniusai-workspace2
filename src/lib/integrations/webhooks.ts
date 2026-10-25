import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { open } from "./crypto";
import type { EventKey } from "./events";
import { EVENTS } from "./events";

type Hook = { id: string; provider: "slack" | "webhook"; url_enc: string; events: string[] };
export type EventData = { title: string; lines: string[]; link?: string; fields: Record<string, string | number | boolean | null> };

const label = (e: EventKey) => EVENTS.find((x) => x.key === e)?.label ?? e;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function slackBody(e: EventKey, d: EventData, workspace: string) {
  const text = `*${esc(d.title)}*${d.lines.length ? "\n" + d.lines.map(esc).join("\n") : ""}${d.link ? `\n<${d.link}|Open in GeniusAI>` : ""}`;
  return { text: esc(`${label(e)}: ${d.title}`), blocks: [
    { type: "section", text: { type: "mrkdwn", text } },
    { type: "context", elements: [{ type: "mrkdwn", text: `${esc(workspace)} · GeniusAI Workspace` }] }
  ] };
}

async function post(url: string, body: unknown): Promise<string> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "GeniusAI-Workspace-Webhooks/1" }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(8_000) });
    return res.ok ? "ok" : `HTTP ${res.status}`;
  } catch { return "unreachable"; }
}

/** Sends one test message to a single connection. */
export async function sendTest(provider: "slack" | "webhook", url: string, workspace: string): Promise<string> {
  if (provider === "slack") {
    return post(url, { text: "GeniusAI Workspace is connected", blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ *GeniusAI Workspace is connected*\nUpdates from ${esc(workspace)} will appear here.` } }] });
  }
  return post(url, { event: "test", occurred_at: new Date().toISOString(), workspace: { name: workspace }, data: { title: "GeniusAI Workspace is connected", test: true } });
}

/**
 * Sends an event to every connection in the workspace that asked for it — at most once per (event, object).
 * Best effort: failures are recorded on the connection and never block the action that caused the event.
 */
export async function deliver(admin: SupabaseClient, o: { workspaceId: string; event: EventKey; objectId: string; data: EventData; dedupe?: boolean }) {
  try {
    const { data: hooks, error } = await admin.from("workspace_integrations").select("id, provider, url_enc, events").eq("workspace_id", o.workspaceId).contains("events", [o.event]);
    if (error || !hooks?.length) return;
    if (o.dedupe !== false) {
      const { error: dupErr } = await admin.from("integration_deliveries").insert({ workspace_id: o.workspaceId, event: o.event, object_id: o.objectId });
      if (dupErr) return; // already sent (or the table isn't there yet)
    }
    const { data: ws } = await admin.from("workspaces").select("name").eq("id", o.workspaceId).maybeSingle();
    const wsName = (ws as { name?: string } | null)?.name ?? "Workspace";
    const payload = { event: o.event, occurred_at: new Date().toISOString(), workspace: { id: o.workspaceId, name: wsName }, data: { ...o.data.fields, title: o.data.title, link: o.data.link ?? null } };
    await Promise.all((hooks as Hook[]).map(async (h) => {
      const url = open(h.url_enc);
      if (!url) return;
      const status = await post(url, h.provider === "slack" ? slackBody(o.event, o.data, wsName) : payload);
      await admin.from("workspace_integrations").update({ last_status: status === "ok" ? `Sent: ${label(o.event)}` : `Failed (${status})`, last_at: new Date().toISOString() }).eq("id", h.id);
    }));
  } catch (e) { console.error("webhook deliver", e); }
}
