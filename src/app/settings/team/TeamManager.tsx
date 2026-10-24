"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, LogOut, Mail, UserPlus, X } from "lucide-react";
import { ShareApps, mailHref, smsHref, waHref } from "@/components/ShareApps";
import { TEAM_ROLES, TEAM_ROLE_LABEL, teamRole, type Role, type TeamRole } from "@/lib/team/roles";
import type { MemberRow } from "@/lib/team/server";

export type InviteRow = { id: string; email: string; role: Role; access: "edit" | "view"; created_at: string; expires_at: string };
type Val = { target: { value: string } };

async function call(url: string, init: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch { return { ok: false, data: { message: "Check your internet connection and try again." } }; }
}
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export function TeamManager({ me, myRole, canManage, workspaceName, members, invites }: {
  me: string; myRole: Role; canManage: boolean; workspaceName: string; members: MemberRow[]; invites: InviteRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: string; emailed: boolean; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function invite() {
    setBusy(true); setError(null); setCreated(null); setCopied(false);
    const r = await call("/api/team/invites", { method: "POST", body: JSON.stringify({ email, role }) });
    setBusy(false);
    if (!r.ok) { setError(String(r.data.message ?? "The invite couldn't be created.")); return; }
    setCreated({ link: String(r.data.link), emailed: Boolean(r.data.emailed), email: email.trim() });
    setEmail(""); refresh();
  }
  async function act(url: string, method: "PATCH" | "DELETE", body?: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setError(null);
    const r = await call(url, { method, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { setError(String(r.data.message ?? "That didn't work.")); return false; }
    refresh(); return true;
  }

  const msg = created ? `You're invited to join ${workspaceName} on GeniusAI Workspace. Open this link to join (valid for 7 days): ${created.link}` : "";
  const roleOptions = TEAM_ROLES.filter((r) => r.key !== "admin" || myRole === "owner");

  return (
    <div className="team-layout">
      {canManage && (
        <section className="panel-card inv-card">
          <h3><UserPlus size={17} aria-hidden="true" /> Invite someone</h3>
          <label className="field">Email (optional)<input className="text-input" type="email" value={email} maxLength={254} onChange={(e: Val) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" /></label>
          <p className="lt-help">With an email, only that person can use the link. Without one, anyone who gets the link can join once — send it on WhatsApp.</p>
          <div className="team-roles" role="radiogroup" aria-label="Role">
            {roleOptions.map((r) => (
              <button key={r.key} type="button" role="radio" aria-checked={role === r.key} className={role === r.key ? "selected" : ""} onClick={() => setRole(r.key)}>
                <strong>{r.label}</strong><span>{r.note}</span>
              </button>
            ))}
          </div>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <button type="button" className="primary-button wide" onClick={invite} disabled={busy}><Link2 size={16} aria-hidden="true" /> {busy ? "Creating…" : "Create invite link"}</button>
          {created && (
            <div className="team-created">
              <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {created.emailed ? `Invite emailed to ${created.email}. You can also send the link:` : "Invite link ready. Send it:"}</p>
              <input className="text-input" readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
              <ShareApps label="Send invite with" items={[
                { kind: "whatsapp", href: waHref(msg) },
                { kind: "sms", href: smsHref(msg) },
                { kind: "email", href: mailHref(created.email, `Join ${workspaceName} on GeniusAI Workspace`, msg) },
                { kind: copied ? "copied" : "copy", onClick: async () => { try { await navigator.clipboard.writeText(created.link); setCopied(true); } catch { /* ignore */ } } }
              ]} />
            </div>
          )}
        </section>
      )}

      <section className="panel-card inv-card">
        <h3>People ({members.length})</h3>
        <ul className="team-list">
          {members.map((m) => {
            const tr = teamRole(m.role, m.access);
            const editable = canManage && m.user_id !== me && m.role !== "owner" && (myRole === "owner" || m.role !== "admin");
            return (
              <li key={m.user_id}>
                <span className="ws-initial" aria-hidden="true">{((m.name || m.email || "?")[0] ?? "?").toUpperCase()}</span>
                <span className="list-text"><strong>{m.name || m.email?.split("@")[0] || "Member"}{m.user_id === me ? " (you)" : ""}</strong><span>{m.email ?? ""}</span></span>
                {editable ? (
                  <span className="team-actions">
                    <select className="text-input" value={tr} aria-label={`Role for ${m.name || m.email}`} onChange={(e: Val) => act("/api/team/members", "PATCH", { userId: m.user_id, role: e.target.value })}>
                      {TEAM_ROLES.filter((r) => r.key !== "admin" || myRole === "owner").map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                    <button type="button" className="icon-button danger" aria-label={`Remove ${m.name || m.email}`} onClick={() => act(`/api/team/members?userId=${m.user_id}`, "DELETE", undefined, `Remove ${m.name || m.email} from ${workspaceName}? They lose access straight away.`)}><X size={16} aria-hidden="true" /></button>
                  </span>
                ) : <span className={`team-badge ${tr}`}>{TEAM_ROLE_LABEL[tr]}</span>}
              </li>
            );
          })}
        </ul>
        {myRole !== "owner" && (
          <button type="button" className="quiet-button with-icon danger team-leave" onClick={async () => { if (await act(`/api/team/members?userId=${me}`, "DELETE", undefined, `Leave ${workspaceName}? You'll need a new invite to come back.`)) window.location.href = "/"; }}><LogOut size={15} aria-hidden="true" /> Leave {workspaceName}</button>
        )}
      </section>

      {canManage && invites.length > 0 && (
        <section className="panel-card inv-card">
          <h3>Open invites</h3>
          <ul className="team-list">
            {invites.map((i) => (
              <li key={i.id}>
                <span className="ws-initial muted" aria-hidden="true"><Mail size={15} /></span>
                <span className="list-text"><strong>{i.email || "Anyone with the link"}</strong><span>{TEAM_ROLE_LABEL[teamRole(i.role, i.access)]} · expires in {daysLeft(i.expires_at)} day{daysLeft(i.expires_at) === 1 ? "" : "s"}</span></span>
                <button type="button" className="quiet-button" onClick={() => act(`/api/team/invites?id=${i.id}`, "DELETE", undefined, "Cancel this invite? The link will stop working.")}>Cancel</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!canManage && <p className="lt-help">Only the owner or an admin can invite people or change roles.</p>}
    </div>
  );
}
