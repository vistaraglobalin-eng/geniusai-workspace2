import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderOpen, SearchX } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext, type FileSummary } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { RecentFiles } from "@/components/RecentFiles";
import { UploadButton } from "@/components/UploadButton";
import { FILE_SORTS, FILE_TYPE_FILTERS, PAGE_SIZE, filesHref, likePattern, parseFilesQuery, type FileTypeFilter } from "@/lib/files-query";
import { FilesSearch } from "./FilesSearch";
import { DropZone } from "./DropZone";

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

  let request = supabase
    .from("files")
    .select("id, object_key, original_filename, mime_type, byte_size, scan_status, created_at, uploaded_by", { count: "exact" })
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null);
  if (mimes) request = request.in("mime_type", mimes as unknown as string[]);
  if (query.q) request = request.ilike("original_filename", likePattern(query.q));
  const { data, count, error } = await request.order(sort.column, { ascending: sort.ascending }).order("id").range(0, query.limit - 1);

  type Row = { id: string; object_key: string; original_filename: string; mime_type: string; byte_size: number; scan_status: FileSummary["scanStatus"]; created_at: string; uploaded_by: string };
  const files: FileSummary[] = ((data ?? []) as Row[]).map((f) => ({
    id: f.id, objectKey: f.object_key, originalFilename: f.original_filename, mimeType: f.mime_type,
    byteSize: Number(f.byte_size), scanStatus: f.scan_status, createdAt: f.created_at, uploadedBy: f.uploaded_by
  }));
  const total = count ?? files.length;
  const filtered = Boolean(query.q) || query.type !== "all";

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="files" breadcrumb="Files">
      <div className="welcome-row">
        <div>
          <h1>Files</h1>
          <p className="subtitle">Everything in {workspace.name}, shared by all your tools.</p>
        </div>
        <UploadButton workspaceId={workspace.id} />
      </div>

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

      <DropZone workspaceId={workspace.id}>
        <section className="panel-card files-panel" aria-labelledby="files-h">
          <h2 id="files-h" className="visually-hidden">File list</h2>
          {error ? (
            <p className="form-message error" role="alert">Files couldn&apos;t be loaded. Please refresh the page.</p>
          ) : files.length === 0 ? (
            filtered ? (
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
              <RecentFiles files={files} currentUserId={ctx.user.id} role={workspace.role} showOpenInTool />
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
