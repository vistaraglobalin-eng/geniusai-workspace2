"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { EMPTY_RESUME, NEW_EDUCATION, NEW_EXPERIENCE } from "@/lib/career/resume";

export function NewResumeButton({ workspaceId, name, email, label = "New resume" }: { workspaceId: string; name: string; email: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setBusy(true); setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data: auth } = await supabase.auth.getUser();
    const data = { ...EMPTY_RESUME, name, email, experience: [{ ...NEW_EXPERIENCE }], education: [{ ...NEW_EDUCATION }] };
    const { data: row, error: e } = await supabase.from("resumes").insert({ workspace_id: workspaceId, created_by: auth.user?.id ?? null, title: name ? `${name} – Resume` : "My resume", data }).select("id").single();
    setBusy(false);
    if (e || !row) { setError(/does not exist|schema cache/i.test(e?.message ?? "") ? "Resumes need a one-time database update." : "It couldn't be created. Please try again."); return; }
    router.push(`/tools/career/${(row as { id: string }).id}`);
  }
  return (
    <>
      <button type="button" className="primary-button" onClick={create} disabled={busy}><Plus size={16} aria-hidden="true" /> {busy ? "Creating…" : label}</button>
      {error && <p className="form-message error" role="alert">{error}</p>}
    </>
  );
}

export function ResumeRowActions({ id, workspaceId }: { id: string; workspaceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function duplicate() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.from("resumes").select("title, template, data").eq("id", id).maybeSingle();
    const { data: auth } = await supabase.auth.getUser();
    if (data) {
      const d = data as { title: string; template: string; data: unknown };
      const { data: row } = await supabase.from("resumes").insert({ workspace_id: workspaceId, created_by: auth.user?.id ?? null, title: `${d.title} (copy)`.slice(0, 80), template: d.template, data: d.data }).select("id").single();
      if (row) router.push(`/tools/career/${(row as { id: string }).id}`);
    }
    setBusy(false);
  }
  async function remove() {
    if (!window.confirm("Delete this resume? This can't be undone.")) return;
    setBusy(true);
    await createSupabaseBrowserClient().from("resumes").delete().eq("id", id);
    setBusy(false); router.refresh();
  }
  return (
    <span className="file-actions">
      <button type="button" className="icon-button" title="Duplicate" aria-label="Duplicate resume" onClick={duplicate} disabled={busy}><Copy size={16} aria-hidden="true" /></button>
      <button type="button" className="icon-button" title="Delete" aria-label="Delete resume" onClick={remove} disabled={busy}><Trash2 size={16} aria-hidden="true" /></button>
    </span>
  );
}
