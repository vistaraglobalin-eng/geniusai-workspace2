"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Download, RefreshCw } from "lucide-react";
import { ShareLinks, type SignLink } from "../ShareLinks";
import { ShareButton, storageSource } from "@/components/ShareSheet";

export function RequestActions({ id, status, allSigned, title, sender, completedKey, sourceKey, documentName }: {
  id: string; status: string; allSigned: boolean; title: string; sender: string; completedKey: string | null; sourceKey: string; documentName: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [links, setLinks] = useState<SignLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = status === "pending";

  useEffect(() => {
    if (!open) return;
    fetch(`/api/sign-requests/${id}/links`).then((r) => r.json()).then((d: { links?: SignLink[] }) => setLinks(d.links ?? [])).catch(() => setLinks([]));
  }, [id, open]);

  async function call(kind: "cancel" | "finalize" | "download") {
    if (kind === "cancel" && !window.confirm("Cancel this request? The signing links will stop working.")) return;
    setBusy(kind); setError(null);
    try {
      const res = await fetch(`/api/sign-requests/${id}/${kind}`, { method: kind === "download" ? "GET" : "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!res.ok) { setError(data.message ?? "That didn't work. Please try again."); return; }
      if (kind === "download" && data.url) { window.location.href = data.url; return; }
      startTransition(() => router.refresh());
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(null); }
  }

  return (
    <div className="sr-actions">
      {status === "completed" && (
        <button type="button" className="primary-button" onClick={() => call("download")} disabled={!!busy}>
          <Download size={16} aria-hidden="true" /> {busy === "download" ? "Preparing…" : "Download signed PDF"}
        </button>
      )}
      {status === "completed" && completedKey && (
        <ShareButton source={storageSource(completedKey, `${documentName.replace(/\.pdf$/i, "")} (signed by all).pdf`, "application/pdf")} />
      )}
      {allSigned && (status === "pending" || status === "finalizing") && (
        <button type="button" className="primary-button" onClick={() => call("finalize")} disabled={!!busy}>
          <RefreshCw size={16} aria-hidden="true" /> {busy === "finalize" ? "Finishing…" : "Produce the signed PDF"}
        </button>
      )}
      {open && links && links.length > 0 && (
        <>
          <h2 className="dash-section-title">Signing links</h2>
          <ShareLinks links={links} title={title} sender={sender} attach={storageSource(sourceKey, documentName, "application/pdf")} />
        </>
      )}
      {open && !allSigned && (
        <button type="button" className="quiet-button with-icon danger" onClick={() => call("cancel")} disabled={!!busy}>
          <Ban size={15} aria-hidden="true" /> {busy === "cancel" ? "Cancelling…" : "Cancel request"}
        </button>
      )}
      {error && <p className="form-message error" role="alert">{error}</p>}
    </div>
  );
}
