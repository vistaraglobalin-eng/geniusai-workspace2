import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, SearchX } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext, type FileSummary } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { RecentFiles } from "@/components/RecentFiles";
import { FILE_SORTS, FILE_TYPE_FILTERS, PAGE_SIZE, filesHref, likePattern, parseFilesQuery, type FileTypeFilter } from "@/lib/files-query";
import { FilesSearch } from "./FilesSearch";
import { DropZone } from "./DropZone";
import { SpacesBar } from "./SpacesBar";
import { SpaceUpload } from "./SpaceUpload";
import { DriveImportButton } from "@/components/DriveButtons";
import { DropboxImportButton } from "@/components/DropboxButtons";
import { dropboxAppKey } from "@/lib/integrations/dropbox";
import { driveStatus, oneDriveStatus } from "@/lib/integrations/status";
import { OneDriveImportButton } from "@/components/OneDriveButtons";
import type { Space } from "@/lib/spaces";

export const metadata: Metadata = { title: "Files · GeniusAI Workspace" };

export default async function FilesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/files");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const query = parseFilesQuery(await searchParams);
  const sort = FILE_SORTS[query.sort];
  const mimes = FILE_TYPE_FILTERS[query.type].mimes;

  // Spaces (folders). Before their database update is installed, Files works without them.
  const [{ data: spaceRows, error: spaceErr }, { data: placement, error: placeErr }] = await Promise.all([
    supabase.from("spaces").select("id, name").eq("workspace_id", workspace.id).order("name").limit(100),
    supabase.from("files").select("space_id").eq("workspace_id", workspace.id).is("deleted_at", null).limit(10000)
  ]);
  const spacesOn = !spaceErr && !placeErr;
  // Policy library flag needs its own database update; until then nothing is marked.
  const { data: policyRows } = spacesOn ? await supabase.from("spaces").select("id").eq("workspace_id", workspace.id).eq("is_policy_library", true) : { data: null };
  const policyIds = ((policyRows ?? []) as { id: string }[]).map((r) => r.id);
  const [drive, onedrive] = await Promise.all([driveStatus(supabase, ctx.user.id), oneDriveStatus(supabase, ctx.user.id)]);
  const counts = new Map<string | null, number>();
  for (const r of (spacesOn ? placement ?? [] : []) as { space_id: string | null }[]) counts.set(r.space_id, (counts.get(r.space_id) ?? 0) + 1);
  const spaces: Space[] = spacesOn ? ((spaceRows ?? []) as Space[]).map((x) => ({ ...x, count: counts.get(x.id) ?? 0 })) : [];
  const currentSpace = spacesOn && query.space && query.space !== "none" && spaces.some((x) => x.id === query.space) ? query.space : null;

  let request = supabase
    .from("files")
    .select(`id, object_key, original_filename, mime_type, byte_size, scan_status, created_at, uploaded_by${spacesOn ? ", space_id" : ""}`, { count: "exact" })
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null);
  if (currentSpace) request = request.eq("space_id", currentSpace);
  else if (spacesOn && query.space === "none") request = request.is("space_id", null);
  if (mimes) request = request.in("mime_type", mimes as unknown as string[]);
  if (query.q) request = request.ilike("original_filename", likePattern(query.q));
  const { data, count, error } = await request.order(sort.column, { ascending: sort.ascending }).order("id").range(0, query.limit - 1);

  type Row = { id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: FileSummary["scanStatus"]; created_at: string; uploaded_by: string; space_id?: string | null };
  const files: FileSummary[] = ((data ?? []) as unknown as Row[]).map((f) => ({
    id: f.id, objectKey: f.object_key, originalFilename: f.original_filename, mimeType: f.mime_type,
    byteSize: Number(f.byte_size), scanStatus: f.scan_status, createdAt: f.created_at, uploadedBy: f.uploaded_by, spaceId: f.space_id ?? null
  }));
  const total = count ?? files.length;
  const filtered = Boolean(query.q) || query.type !== "all" || Boolean(currentSpace) || query.space === "none";

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="files" breadcrumb="Files">
      <div className="welcome-row">
        <div>
          <h1>Files</h1>
          <p className="subtitle">Everything in {workspace.name}, shared by all your tools.</p>
        </div>
        <div className="files-top-actions">
          <SpaceUpload workspaceId={workspace.id} spaceId={currentSpace} />
          {drive.connected && drive.pickerReady && workspace.access !== "view" && <DriveImportButton spaceId={currentSpace} />}
          {dropboxAppKey() && workspace.access !== "view" && <DropboxImportButton appKey={dropboxAppKey()} spaceId={currentSpace} />}
          {onedrive.connected && workspace.access !== "view" && <OneDriveImportButton spaceId={currentSpace} />}
        </div>
      </div>

      {spacesOn && (
        <SpacesBar spaces={spaces} query={query} total={placement?.length ?? 0} unsorted={counts.get(null) ?? 0} canEdit={workspace.access !== "view"}
          isAdmin={workspace.role === "owner" || workspace.role === "admin"} policyIds={policyIds} />
      )}

      <div className="files-toolbar">
        <FilesSearch query={query} />
      </div>
      <nav className="chip-row" aria-label="Filter by type">
        {(Object.keys(FILE_TYPE_FILTERS) as FileTypeFilter[]).map((t) => (
          <Link key={t} className="chip" href={filesHref({ type: t, limit: PAGE_SIZE }, query)} aria-current={query.type === t ? "true" : undefined} scroll={false}>
            {FILE_TYPE_FILTERS[t].label}
          </Link>
        ))}
      </nav>

      <DropZone workspaceId={workspace.id} spaceId={currentSpace}>
        <section className="panel-card files-panel" aria-labelledby="files-h">
          <h2 id="files-h" className="visually-hidden">File list</h2>
          {error ? (
            <p className="form-message error" role="alert">Files couldn&apos;t be loaded. Please refresh the page.</p>
          ) : files.length === 0 ? (
            currentSpace && !query.q && query.type === "all" ? (
              <div className="empty-state">
                <div className="empty-icon"><FolderOpen size={22} aria-hidden="true" /></div>
                <strong>This space is empty</strong>
                <span>Upload here, or move files in with the folder button on any file.</span>
              </div>
            ) : filtered ? (
              <div className="empty-state">
                <div className="empty-icon"><SearchX size={22} aria-hidden="true" /></div>
                <strong>No files match{query.q ? ` “${query.q}”` : " this filter"}</strong>
                <span><Link className="link-button" href="/files">Clear search and filters</Link></span>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon"><FolderOpen size={22} aria-hidden="true" /></div>
                <strong>No files yet</strong>
                <span>Upload a file, or drag one onto this area.</span>
              </div>
            )
          ) : (
            <>
              <p className="files-summary" role="status">
                Showing {files.length} of {total} file{total === 1 ? "" : "s"}{query.q ? ` matching “${query.q}”` : ""}
              </p>
              <RecentFiles files={files} currentUserId={ctx.user.id} role={workspace.role} showOpenInTool spaces={spacesOn ? spaces : undefined} canMove={workspace.access !== "view"} />
              {files.length < total && (
                <div className="load-more">
                  <Link className="secondary-button" href={filesHref({ limit: query.limit + PAGE_SIZE }, query)} scroll={false}>
                    Load {Math.min(PAGE_SIZE, total - files.length)} more
                  </Link>
                </div>
              )}
            </>
          )}
        </section>
      </DropZone>
    </AppShell>
  );
}
