import type { Metadata } from "next";
import Link from "next/link";
import { FolderLock, Sparkles } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITE } from "@/lib/site";
import { SHARED_LIST_LIMIT, canSeeFiles } from "@/lib/shares";
import { loadShare } from "@/lib/shares-server";
import { SharedFolder, type SharedFile } from "./SharedFolder";

export const metadata: Metadata = { title: "Shared folder · GeniusAI Workspace", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function SharedFolderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const ctx = await loadShare(admin, token).catch(() => null);

  let body;
  if (!ctx || ctx.block) {
    body = (
      <section className="panel-card sr-public-card">
        <div className="empty-icon"><FolderLock size={22} aria-hidden="true" /></div>
        <h1>{!ctx ? "This link isn't valid" : ctx.block === "expired" ? "This link has expired" : "This link has been turned off"}</h1>
        <p>{!ctx ? "Check that you opened the complete link." : "Ask the person who shared it for a new link."}</p>
      </section>
    );
  } else {
    const { share } = ctx;
    // Best-effort counter for the owner ("opened 12 times").
    await admin.from("space_shares").update({ view_count: share.view_count + 1, last_used_at: new Date().toISOString() }).eq("id", share.id);
    let files: SharedFile[] = [];
    let total = 0;
    if (canSeeFiles(share.mode)) {
      const { data, count } = await admin.from("files")
        .select("id, original_filename, mime_type, byte_size, created_at", { count: "exact" })
        .eq("workspace_id", share.workspace_id).eq("space_id", share.space_id).is("deleted_at", null)
        .not("scan_status", "in", "(quarantined,failed)")
        .order("created_at", { ascending: false }).limit(SHARED_LIST_LIMIT);
      type Row = { id: string; original_filename: string; mime_type: string; byte_size: number; created_at: string };
      files = ((data ?? []) as Row[]).map((f) => ({ id: f.id, name: f.original_filename, mime: f.mime_type, size: Number(f.byte_size), createdAt: f.created_at }));
      total = count ?? files.length;
    }
    body = (
      <SharedFolder token={token} spaceName={ctx.spaceName} workspaceName={ctx.workspaceName} label={share.label}
        mode={share.mode} expiresAt={share.expires_at} files={files} total={total} />
    );
  }

  return (
    <div className="public-shell">
      <header className="public-header sr-public-header">
        <Link className="brand" href="/" aria-label={`${SITE.productName}: home`}>
          <span className="brand-mark"><Sparkles size={20} aria-hidden="true" /></span>
          <span>GeniusAI<span className="brand-light"> Workspace</span></span>
        </Link>
        <span className="sr-secure"><FolderLock size={15} aria-hidden="true" /> Private link</span>
      </header>
      <main id="main" className="public-main sr-public-main">{body}</main>
    </div>
  );
}
