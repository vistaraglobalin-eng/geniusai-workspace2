"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ALLOWED_MIME_TYPES, UploadError, uploadWorkspaceFile, type UploadedFile } from "@/lib/storage/files";
import type { ModuleKey } from "@/lib/modules";

export function UploadButton({
  workspaceId,
  moduleKey,
  accept,
  label = "Upload a file",
  onUploaded
}: {
  workspaceId: string;
  moduleKey?: ModuleKey;
  accept?: readonly string[];
  label?: string;
  onUploaded?: (file: UploadedFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function onFiles(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const uploaded = await uploadWorkspaceFile(createSupabaseBrowserClient(), { workspaceId, file, moduleKey });
      setMessage({ kind: "success", text: `Uploaded ${file.name}` });
      onUploaded?.(uploaded);
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof UploadError ? err.message : "The upload didn't go through. Please try again."
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="upload-control">
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={(accept ?? ALLOWED_MIME_TYPES).join(",")}
        onChange={(e) => onFiles(e.target.files)}
      />
      <button className="primary-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
        <UploadCloud size={17} /> {busy ? "Uploading…" : label}
      </button>
      {message && (
        <span className={`upload-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </span>
      )}
    </div>
  );
}
