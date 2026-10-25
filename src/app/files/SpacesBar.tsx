"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Folder, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import type { Space } from "@/lib/spaces";
import { filesHref, PAGE_SIZE, type FilesQuery } from "@/lib/files-query";

/** Spaces: folders across the top of Files. Pick one to see only its files; create, rename or delete. */
export function SpacesBar({ spaces, query, total, unsorted, canEdit }: { spaces: Space[]; query: FilesQuery; total: number; unsorted: number; canEdit: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "new" | "rename">("idle");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = spaces.find((s) => s.id === query.space) ?? null;
  const href = (space: string) => filesHref({ space, limit: PAGE_SIZE }, query);

  async function call(url: string, method: string, body?: object): Promise<{ space?: Space } | null> {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = (await res.json().catch(() => ({}))) as { message?: string; space?: Space };
      if (!res.ok) { setError(d.message ?? "That didn't work. Please try again."); return null; }
      return d;
    } catch { setError("The connection dropped. Please try again."); return null; }
    finally { setBusy(false); }
  }
  async function create() {
    const d = await call("/api/spaces", "POST", { name });
    if (d?.space) { setMode("idle"); setName(""); startTransition(() => router.push(href(d.space!.id), { scroll: false })); }
  }
  async function rename() {
    if (!current) return;
    if (await call(`/api/spaces/${current.id}`, "PATCH", { name })) { setMode("idle"); startTransition(() => router.refresh()); }
  }
  async function remove() {
    if (!current || !window.confirm(`Delete the space “${current.name}”? Its files stay in Files, just without a space.`)) return;
    if (await call(`/api/spaces/${current.id}`, "DELETE")) startTransition(() => router.push(href(""), { scroll: false }));
  }

  return (
    <section className="spaces" aria-label="Spaces">
      <nav className="spaces-row">
        <Link className={`space-chip${!query.space ? " on" : ""}`} href={href("")} scroll={false} aria-current={!query.space ? "true" : undefined}>All files <span>{total}</span></Link>
        {spaces.map((s) => (
          <Link key={s.id} className={`space-chip${query.space === s.id ? " on" : ""}`} href={href(s.id)} scroll={false} aria-current={query.space === s.id ? "true" : undefined}>
            <Folder size={14} aria-hidden="true" />{s.name} <span>{s.count ?? 0}</span>
          </Link>
        ))}
        {spaces.length > 0 && (
          <Link className={`space-chip${query.space === "none" ? " on" : ""}`} href={href("none")} scroll={false} aria-current={query.space === "none" ? "true" : undefined}>Not in a space <span>{unsorted}</span></Link>
        )}
        {canEdit && mode !== "new" && (
          <button type="button" className="space-chip add" onClick={() => { setMode("new"); setName(""); setError(null); }}><FolderPlus size={14} aria-hidden="true" /> New space</button>
        )}
      </nav>
      {mode !== "idle" && (
        <form className="space-form" onSubmit={(e) => { e.preventDefault(); void (mode === "new" ? create() : rename()); }}>
          <input className="text-input" autoFocus aria-label="Space name" placeholder="e.g. Clients, HR, GST 2026-27" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary-button" disabled={busy || !name.trim()}><Check size={15} aria-hidden="true" /> {mode === "new" ? "Create" : "Rename"}</button>
          <button type="button" className="quiet-button" onClick={() => { setMode("idle"); setError(null); }}><X size={15} aria-hidden="true" /> Cancel</button>
        </form>
      )}
      {current && canEdit && mode === "idle" && (
        <div className="space-head">
          <strong><Folder size={16} aria-hidden="true" /> {current.name}</strong>
          <button type="button" className="quiet-button with-icon" onClick={() => { setMode("rename"); setName(current.name); }}><Pencil size={14} aria-hidden="true" /> Rename</button>
          <button type="button" className="quiet-button with-icon danger-text" onClick={remove} disabled={busy}><Trash2 size={14} aria-hidden="true" /> Delete space</button>
          <span className="field-hint">New uploads here go into this space.</span>
        </div>
      )}
      {error && <p className="form-message error" role="alert">{error}</p>}
    </section>
  );
}
