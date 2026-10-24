"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, FileText, Image as ImageIcon, Save, Share2 } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FILES_BUCKET, uploadWorkspaceFile } from "@/lib/storage/files";

type F = { id: string; name: string; objectKey: string; byteSize: number };
const QUALITY = [
  { key: "small", label: "Small", note: "For WhatsApp", width: 900 },
  { key: "standard", label: "Standard", note: "Clear on phones", width: 1600 },
  { key: "high", label: "High", note: "For printing", width: 2480 }
] as const;
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** PDF → JPG/PNG on the person's own device (no upload needed to convert). */
export function PdfToImages({ workspaceId, files, initialId }: { workspaceId: string; files: F[]; initialId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialId ?? files[0]?.id ?? null);
  const [quality, setQuality] = useState<(typeof QUALITY)[number]["key"]>("standard");
  const [format, setFormat] = useState<"jpg" | "png">("jpg");
  const [busy, setBusy] = useState<string | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const file = files.find((f) => f.id === fileId) ?? null;

  async function convert() {
    if (!file) return;
    setError(null); setSaved(false); urls.forEach((u) => URL.revokeObjectURL(u)); setImages([]); setUrls([]);
    setBusy("Opening the PDF…");
    try {
      const { data, error: e } = await createSupabaseBrowserClient().storage.from(FILES_BUCKET).download(file.objectKey);
      if (e || !data) throw new Error("download");
      const { pdfToImages } = await import("@/lib/pdf/convert-client");
      const width = QUALITY.find((q) => q.key === quality)!.width;
      const blobs = await pdfToImages(new Uint8Array(await data.arrayBuffer()), format, (d, t) => setBusy(`Converting page ${d} of ${t}…`), width);
      const base = file.name.replace(/\.pdf$/i, "");
      const out = blobs.map((b, i) => new File([b], blobs.length === 1 ? `${base}.${format}` : `${base}-page-${i + 1}.${format}`, { type: b.type }));
      setImages(out); setUrls(out.map((f) => URL.createObjectURL(f)));
    } catch {
      setError("This PDF couldn't be converted. If it has a password, unlock it first.");
    } finally { setBusy(null); }
  }

  async function shareAll() {
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    try { if (nav.canShare?.({ files: images })) { await navigator.share({ files: images }); return; } } catch { return; }
    downloadAll();
  }
  function downloadAll() {
    images.forEach((f, i) => setTimeout(() => {
      const a = document.createElement("a"); a.href = urls[i]; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    }, i * 300));
  }
  async function saveAll() {
    setBusy("Saving to Files…"); setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      for (const [i, f] of images.entries()) { setBusy(`Saving ${i + 1} of ${images.length}…`); await uploadWorkspaceFile(supabase, { workspaceId, file: f }); }
      setSaved(true); startTransition(() => router.refresh());
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "The images couldn't be saved."); }
    finally { setBusy(null); }
  }

  return (
    <div className="p2i">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the PDF</h2></div>
        <div className="dg-upload"><UploadButton workspaceId={workspaceId} accept={["application/pdf"]} label="Upload a PDF" onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} /></div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FileText size={22} aria-hidden="true" /></div><p>Upload a PDF to turn its pages into pictures.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your PDFs">
            {files.slice(0, 12).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="p2i-file" checked={fileId === f.id} onChange={() => { setFileId(f.id); setImages([]); }} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Quality</h2></div>
        <div className="segmented" role="radiogroup" aria-label="Quality">
          {QUALITY.map((q) => <label key={q.key} className={quality === q.key ? "selected" : ""}><input type="radio" name="p2i-q" checked={quality === q.key} onChange={() => setQuality(q.key)} /> {q.label}</label>)}
        </div>
        <p className="field-hint">{QUALITY.find((q) => q.key === quality)!.note}. Converted on this device, up to 100 pages.</p>
        <div className="segmented" role="radiogroup" aria-label="Format">
          <label className={format === "jpg" ? "selected" : ""}><input type="radio" name="p2i-f" checked={format === "jpg"} onChange={() => setFormat("jpg")} /> JPG</label>
          <label className={format === "png" ? "selected" : ""}><input type="radio" name="p2i-f" checked={format === "png"} onChange={() => setFormat("png")} /> PNG</label>
        </div>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <button type="button" className="primary-button wide" onClick={convert} disabled={!file || !!busy}><ImageIcon size={16} aria-hidden="true" /> {busy ?? `Convert to ${format.toUpperCase()}`}</button>
      </section>

      {images.length > 0 && (
        <section className="panel-card dg-step p2i-result">
          <div className="dg-step-head"><span className="dg-step-num">3</span><h2>{images.length} {images.length === 1 ? "image" : "images"} ready</h2></div>
          <div className="inv-row">
            <button type="button" className="primary-button" onClick={shareAll} disabled={!!busy}><Share2 size={16} aria-hidden="true" /> Share</button>
            <button type="button" className="secondary-button" onClick={saveAll} disabled={!!busy || saved}>{saved ? <><Check size={16} aria-hidden="true" /> Saved to Files</> : <><Save size={16} aria-hidden="true" /> Save to Files</>}</button>
            <button type="button" className="quiet-button with-icon" onClick={downloadAll}><Download size={16} aria-hidden="true" /> Download</button>
          </div>
          <div className="p2i-grid">
            {urls.map((u, i) => (
              <a key={u} href={u} download={images[i].name} className="p2i-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Page ${i + 1}`} />
                <span>Page {i + 1} · {sizeOf(images[i].size)}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
