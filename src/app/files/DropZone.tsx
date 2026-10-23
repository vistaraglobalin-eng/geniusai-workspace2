"use client";

import { useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { UploadError, uploadWorkspaceFile } from "@/lib/storage/files";

/** Drag files onto the library to upload them (desktop/tablet). Phones use the Upload button. */
export function DropZone({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const depth = useRef(0);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).slice(0, 10);
    if (files.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    let done = 0;
    const problems: string[] = [];
    setStatus({ kind: "success", text: `Uploading ${files.length} file${files.length === 1 ? "" : "s"}…` });
    for (const file of files) {
      try {
        await uploadWorkspaceFile(supabase, { workspaceId, file });
        done++;
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof UploadError ? err.message : "upload failed"}`);
      }
    }
    setStatus(
      problems.length
        ? { kind: "error", text: `${done} uploaded. ${problems.join(" · ")}` }
        : { kind: "success", text: `${done} file${done === 1 ? "" : "s"} uploaded` }
    );
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={`drop-zone${dragging ? " dragging" : ""}`}
      onDragEnter={(e) => { if (hasFiles(e)) { depth.current++; setDragging(true); } }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); }}
      onDrop={onDrop}
    >
      {status && <p className={`form-message ${status.kind}`} role={status.kind === "error" ? "alert" : "status"} style={{ marginBottom: 10 }}>{status.text}</p>}
      {children}
    </div>
  );
}
