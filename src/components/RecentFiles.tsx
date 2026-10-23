"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Image as ImageIcon, Sheet, Sparkles, Trash2 } from "lucide-react";
import { isDocumentReadable } from "@/lib/documents/tasks";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { deleteWorkspaceFile, getFileDownloadUrl } from "@/lib/storage/files";
import type { FileSummary, WorkspaceRole } from "@/lib/workspace";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <ImageIcon size={17} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <Sheet size={17} />;
  return <FileText size={17} />;
}

const SCAN_LABEL: Record<FileSummary["scanStatus"], string | null> = {
  pending: "Checking",
  clean: null,
  quarantined: "Blocked",
  failed: "Check failed"
};

export function RecentFiles({
  files,
  currentUserId,
  role,
  showOpenInTool = false
}: {
  files: FileSummary[];
  currentUserId: string;
  role: WorkspaceRole;
  showOpenInTool?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(file: FileSummary) {
    setError(null);
    setBusyId(file.id);
    const url = await getFileDownloadUrl(createSupabaseBrowserClient(), file.objectKey, {
      downloadAs: file.originalFilename
    });
    setBusyId(null);
    // The link is served as an attachment, so the browser saves it and stays on this page.
    if (url) window.location.assign(url);
    else setError(`${file.originalFilename} can't be downloaded right now.`);
  }

  async function remove(file: FileSummary) {
    setError(null);
    setBusyId(file.id);
    const ok = await deleteWorkspaceFile(createSupabaseBrowserClient(), file);
    setBusyId(null);
    setConfirmingId(null);
    if (ok) startTransition(() => router.refresh());
    else setError(`${file.originalFilename} couldn't be deleted.`);
  }

  if (files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><FileText size={22} /></div>
        <strong>Your workspace is ready</strong>
        <span>Upload a file and you&apos;ll find it here.</span>
      </div>
    );
  }

  const canManage = (file: FileSummary) => file.uploadedBy === currentUserId || role === "owner" || role === "admin";

  return (
    <>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <ul className="file-list">
        {files.map((file) => {
          const label = SCAN_LABEL[file.scanStatus];
          const blocked = file.scanStatus === "quarantined";
          const busy = busyId === file.id;
          return (
            <li key={file.id} className="file-row">
              <span className="file-icon"><FileIcon mime={file.mimeType} /></span>
              <span className="file-meta">
                <strong title={file.originalFilename}>{file.originalFilename}</strong>
                <span>
                  {formatBytes(file.byteSize)} ·{" "}
                  <time dateTime={file.createdAt} suppressHydrationWarning>{formatWhen(file.createdAt)}</time>
                  {label && <em className={`scan-badge ${file.scanStatus}`}>{label}</em>}
                </span>
              </span>
              <span className="file-actions">
                {confirmingId === file.id ? (
                  <>
                    <button type="button" className="danger-button" disabled={busy} onClick={() => remove(file)}>
                      {busy ? "Deleting…" : "Delete"}
                    </button>
                    <button type="button" className="quiet-button" onClick={() => setConfirmingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {showOpenInTool && !blocked && isDocumentReadable(file.mimeType) && (
                      <Link
                        className="icon-button"
                        href={`/tools/documents?file=${file.id}`}
                        aria-label={`Open ${file.originalFilename} in Document Genius`}
                        title="Open in Document Genius"
                      >
                        <Sparkles size={16} />
                      </Link>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      title="Download"
                      aria-label={`Download ${file.originalFilename}`}
                      disabled={blocked || busy}
                      onClick={() => download(file)}
                    >
                      <Download size={16} />
                    </button>
                    {canManage(file) && !blocked && (
                      <button
                        type="button"
                        className="icon-button"
                        title="Delete"
                        aria-label={`Delete ${file.originalFilename}`}
                        onClick={() => setConfirmingId(file.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
