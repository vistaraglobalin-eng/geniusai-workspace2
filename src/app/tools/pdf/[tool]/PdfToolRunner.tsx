"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, FileArchive, FileText, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getFileDownloadUrl } from "@/lib/storage/files";
import {
  IMAGE_MIMES_FOR_PDF, LIMITS, OFFICE_MIMES, PDF_MIME, TOOL_INFO,
  type CompressLevel, type JpgQuality, type PageNumberFormat, type PageNumberPosition, type PdfRunResponse, type PdfTool
} from "@/lib/pdf/catalog";

export type ToolFile = { id: string; name: string; mimeType: string; byteSize: number };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Options = {
  splitMode: "ranges" | "every"; ranges: string; every: number;
  pages: string; order: string;
  angle: 90 | 180 | 270; rotatePages: string;
  position: PageNumberPosition; format: PageNumberFormat; start: number; skipFirst: boolean;
  text: string; opacity: number;
  pageSize: "a4" | "fit";
  level: CompressLevel; password: string; confirm: string; quality: JpgQuality;
};

const DEFAULTS: Options = {
  splitMode: "ranges", ranges: "", every: 1, pages: "", order: "",
  angle: 90, rotatePages: "",
  position: "bottom-center", format: "n", start: 1, skipFirst: false,
  text: "CONFIDENTIAL", opacity: 20, pageSize: "a4",
  level: "recommended", password: "", confirm: "", quality: "standard"
};

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = `seg-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <span className="field-label" id={id}>{label}</span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <label key={String(o.value)} className={value === o.value ? "selected" : ""}>
            <input type="radio" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function PdfToolRunner({ tool, workspaceId, files, initialSelection, workerReady = true }: { tool: PdfTool; workspaceId: string; files: ToolFile[]; initialSelection: string[]; workerReady?: boolean }) {
  const info = TOOL_INFO[tool];
  const multi = info.input !== "pdf-single";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(initialSelection.length ? initialSelection : !multi && files[0] ? [files[0].id] : []);
  const [o, setO] = useState<Options>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PdfRunResponse["files"] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const set = (patch: Partial<Options>) => setO((prev) => ({ ...prev, ...patch }));
  const byId = new Map(files.map((f) => [f.id, f]));
  const accept = info.input === "image-multi" ? [...IMAGE_MIMES_FOR_PDF] : info.input === "office-single" ? [...OFFICE_MIMES] : [PDF_MIME];

  function toggle(id: string) {
    setResults(null);
    if (!multi) return setSelected([id]);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= LIMITS.maxFiles ? s : [...s, id]));
  }
  function move(index: number, delta: number) {
    setSelected((s) => {
      const next = [...s];
      const j = index + delta;
      if (j < 0 || j >= next.length) return s;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function options(): Record<string, unknown> {
    switch (tool) {
      case "split": return o.splitMode === "every" ? { mode: "every", every: o.every } : { mode: "ranges", ranges: o.ranges };
      case "remove-pages":
      case "extract-pages": return { pages: o.pages };
      case "organize": return { order: o.order };
      case "rotate": return { angle: o.angle, pages: o.rotatePages };
      case "page-numbers": return { position: o.position, format: o.format, start: o.start, skipFirst: o.skipFirst };
      case "watermark": return { text: o.text, opacity: o.opacity / 100 };
      case "images-to-pdf": return { pageSize: o.pageSize };
      case "compress": return { level: o.level };
      case "protect":
      case "unlock": return { password: o.password };
      case "pdf-to-jpg": return { quality: o.quality };
      default: return {};
    }
  }

  const minFiles = tool === "merge" ? 2 : 1;
  const passwordProblem =
    tool === "protect" ? (o.password.length < 6 ? "Use at least 6 characters." : o.password !== o.confirm ? "The passwords don't match." : null) : null;
  const ready = workerReady && selected.length >= minFiles && !passwordProblem;

  async function run() {
    setRunning(true);
    setError(null);
    setResults(null);
    setNote(null);
    try {
      const res = await fetch("/api/pdf/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool, fileIds: selected, options: options() })
      });
      const data = (await res.json().catch(() => ({}))) as Partial<PdfRunResponse> & { message?: string };
      if (!res.ok || !data.files) {
        setError(data.message ?? "Something went wrong. Please try again.");
        return;
      }
      setResults(data.files);
      setNote(data.note ?? null);
      if (tool === "protect" || tool === "unlock") set({ password: "", confirm: "" }); // don't keep passwords around
      startTransition(() => router.refresh());
    } catch {
      setError("We lost the connection. Check Files in a moment; if the result isn't there, try again.");
    } finally {
      setRunning(false);
    }
  }

  async function download(f: PdfRunResponse["files"][number]) {
    setDownloading(f.id);
    const url = await getFileDownloadUrl(createSupabaseBrowserClient(), f.objectKey, { downloadAs: f.name });
    setDownloading(null);
    if (url) window.location.assign(url);
    else setError(`${f.name} couldn't be downloaded right now. It's in Files.`);
  }

  const pageHint = "Use page numbers and ranges, e.g. 1-3, 5, 8-";

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head">
          <span className="dg-step-num">1</span>
          <div>
            <h3>{multi ? (info.input === "image-multi" ? "Choose images" : "Choose PDFs") : info.input === "office-single" ? "Choose a file" : "Choose a PDF"}</h3>
            <p>{tool === "merge" ? "Pick two or more, then set their order." : info.input === "image-multi" ? "JPG or PNG. Each image becomes a page, in the order you pick." : info.input === "office-single" ? "Word, Excel, PowerPoint, OpenDocument, RTF, CSV or text." : "From your Files, or upload one."}</p>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{info.input === "image-multi" ? <ImageIcon size={22} /> : <FileText size={22} />}</div>
            <strong>No {info.input === "image-multi" ? "images" : info.input === "office-single" ? "Office files" : "PDFs"} yet</strong>
            <span>Upload one to get started.</span>
          </div>
        ) : (
          <div className="dg-files" role={multi ? "group" : "radiogroup"} aria-label="Files">
            {files.map((f) => {
              const isSel = selected.includes(f.id);
              return (
                <label key={f.id} className={`dg-file${isSel ? " selected" : ""}`}>
                  <input type={multi ? "checkbox" : "radio"} name="file" checked={isSel} onChange={() => toggle(f.id)} />
                  <span className="file-icon">{f.mimeType.startsWith("image/") ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
                  <span className="file-meta"><strong title={f.name}>{f.name}</strong><span>{formatBytes(f.byteSize)}{multi && isSel ? ` · #${selected.indexOf(f.id) + 1}` : ""}</span></span>
                </label>
              );
            })}
          </div>
        )}

        <div className="dg-upload">
          <UploadButton
            workspaceId={workspaceId}
            moduleKey="documents"
            accept={accept}
            label={info.input === "image-multi" ? "Upload images" : info.input === "office-single" ? "Upload a file" : "Upload a PDF"}
            onUploaded={(f) => {
              setResults(null);
              setSelected((s) => (multi ? [...s, f.id].slice(0, LIMITS.maxFiles) : [f.id]));
            }}
          />
        </div>
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head">
          <span className="dg-step-num">2</span>
          <div><h3>{multi ? "Order and options" : "Options"}</h3><p>Free. No credits used.</p></div>
        </div>

        {multi && selected.length > 0 && (
          <ol className="order-list" aria-label="Order">
            {selected.map((id, i) => (
              <li key={id}>
                <span className="order-num">{i + 1}</span>
                <span className="order-name" title={byId.get(id)?.name}>{byId.get(id)?.name ?? "Uploading…"}</span>
                <button type="button" className="icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                <button type="button" className="icon-button" aria-label="Move down" disabled={i === selected.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                <button type="button" className="icon-button" aria-label="Remove from list" onClick={() => toggle(id)}><X size={15} /></button>
              </li>
            ))}
          </ol>
        )}

        {tool === "split" && (
          <>
            <Segmented label="Split" value={o.splitMode} options={[{ value: "ranges", label: "By page ranges" }, { value: "every", label: "Every N pages" }]} onChange={(v) => set({ splitMode: v })} />
            {o.splitMode === "ranges" ? (
              <div className="field">
                <label htmlFor="ranges">Ranges (each one becomes a file)</label>
                <input id="ranges" className="text-input" placeholder="1-3, 4-6, 7-" value={o.ranges} onChange={(e) => set({ ranges: e.target.value })} />
                <p className="field-hint">“7-” means page 7 to the end.</p>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="every">Pages per file</label>
                <input id="every" className="text-input" type="number" min={1} max={500} value={o.every} onChange={(e) => set({ every: Number(e.target.value) })} />
              </div>
            )}
          </>
        )}

        {(tool === "remove-pages" || tool === "extract-pages") && (
          <div className="field">
            <label htmlFor="pages">{tool === "remove-pages" ? "Pages to remove" : "Pages to keep in the new PDF"}</label>
            <input id="pages" className="text-input" placeholder="2, 5-7" value={o.pages} onChange={(e) => set({ pages: e.target.value })} />
            <p className="field-hint">{pageHint}{tool === "extract-pages" ? ". Pages appear in the order you type them." : ""}</p>
          </div>
        )}

        {tool === "organize" && (
          <div className="field">
            <label htmlFor="order">New page order</label>
            <input id="order" className="text-input" placeholder="3, 1, 2" value={o.order} onChange={(e) => set({ order: e.target.value })} />
            <p className="field-hint">Pages you list come first, in that order. Any pages you leave out follow in their original order.</p>
          </div>
        )}

        {tool === "rotate" && (
          <>
            <Segmented label="Turn" value={o.angle} options={[{ value: 90, label: "90° right" }, { value: 180, label: "180°" }, { value: 270, label: "90° left" }]} onChange={(v) => set({ angle: v })} />
            <div className="field">
              <label htmlFor="rpages">Pages (optional)</label>
              <input id="rpages" className="text-input" placeholder="All pages" value={o.rotatePages} onChange={(e) => set({ rotatePages: e.target.value })} />
              <p className="field-hint">Leave empty to rotate every page.</p>
            </div>
          </>
        )}

        {tool === "page-numbers" && (
          <>
            <div className="field">
              <label htmlFor="pos">Position</label>
              <select id="pos" className="select-input" value={o.position} onChange={(e) => set({ position: e.target.value as PageNumberPosition })}>
                <option value="bottom-center">Bottom centre</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-right">Top right</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="fmt">Style</label>
              <select id="fmt" className="select-input" value={o.format} onChange={(e) => set({ format: e.target.value as PageNumberFormat })}>
                <option value="n">1, 2, 3</option>
                <option value="page-n-of-total">Page 1 of 10</option>
                <option value="n-of-total">1 / 10</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="start">Start at</label>
              <input id="start" className="text-input" type="number" min={0} max={99999} value={o.start} onChange={(e) => set({ start: Number(e.target.value) })} />
            </div>
            <label className="check-row"><input type="checkbox" checked={o.skipFirst} onChange={(e) => set({ skipFirst: e.target.checked })} /> Don&apos;t number the first page (cover)</label>
          </>
        )}

        {tool === "watermark" && (
          <>
            <div className="field">
              <label htmlFor="wm">Watermark text</label>
              <input id="wm" className="text-input" maxLength={LIMITS.maxWatermarkChars} value={o.text} onChange={(e) => set({ text: e.target.value })} />
              <p className="field-hint">English letters, numbers and common symbols for now.</p>
            </div>
            <div className="field">
              <label htmlFor="op">Strength: {o.opacity}%</label>
              <input id="op" type="range" min={8} max={60} step={2} value={o.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} className="range-input" />
            </div>
          </>
        )}

        {tool === "images-to-pdf" && (
          <Segmented label="Page size" value={o.pageSize} options={[{ value: "a4", label: "A4 with margins" }, { value: "fit", label: "Same as image" }]} onChange={(v) => set({ pageSize: v })} />
        )}

        {tool === "compress" && (
          <div className="field">
            <span className="field-label" id="lvl">Compression</span>
            <div className="dg-tasks" role="radiogroup" aria-labelledby="lvl">
              {([
                ["low", "Light", "Best quality, smaller savings. Good for printing."],
                ["recommended", "Recommended", "Good quality, much smaller. Best for email."],
                ["extreme", "Strong", "Smallest file; images lose detail."]
              ] as const).map(([value, label, hint]) => (
                <label key={value} className={`choice${o.level === value ? " selected" : ""}`}>
                  <input type="radio" checked={o.level === value} onChange={() => set({ level: value })} />
                  <span><strong>{label}</strong><small>{hint}</small></span>
                </label>
              ))}
            </div>
          </div>
        )}

        {(tool === "protect" || tool === "unlock") && (
          <>
            <div className="field">
              <label htmlFor="pw">{tool === "protect" ? "New password" : "Password"}</label>
              <div className="input-with-action">
                <input
                  id="pw"
                  className="text-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete={tool === "protect" ? "new-password" : "off"}
                  maxLength={128}
                  value={o.password}
                  onChange={(e) => set({ password: e.target.value })}
                />
                <button type="button" className="icon-button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="field-hint">
                {tool === "protect"
                  ? "At least 6 characters. We don't store it and can't recover it, so keep it somewhere safe."
                  : "Leave empty if the PDF opens without a password but is restricted. Only unlock files you own or have permission to change."}
              </p>
            </div>
            {tool === "protect" && (
              <div className="field">
                <label htmlFor="pw2">Confirm password</label>
                <input id="pw2" className="text-input" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} value={o.confirm} onChange={(e) => set({ confirm: e.target.value })} />
                {o.confirm && passwordProblem && <p className="field-hint" role="status">{passwordProblem}</p>}
              </div>
            )}
          </>
        )}

        {tool === "pdf-to-jpg" && (
          <>
            <Segmented label="Image quality" value={o.quality} options={[{ value: "small", label: "Small (72 dpi)" }, { value: "standard", label: "Standard (150 dpi)" }, { value: "high", label: "High (300 dpi)" }]} onChange={(v) => set({ quality: v })} />
            <p className="dg-hint">One page gives a JPG; several pages come as one ZIP file. Up to 50 pages.</p>
          </>
        )}

        {(tool === "repair" || tool === "office-to-pdf") && (
          <p className="dg-hint">{tool === "repair" ? "No options needed. We'll rebuild the PDF's structure and keep everything we can." : "No options needed. Layout and fonts are kept as closely as possible."}</p>
        )}

        {!workerReady && (
          <p className="form-message warning">This tool runs on the GeniusAI PDF service, which isn&apos;t set up on this server yet. (Admins: see pdf-worker/README.md.)</p>
        )}

        {tool === "merge" && selected.length < 2 && <p className="dg-hint">Select at least two PDFs.</p>}

        {error && <p className="form-message error" role="alert">{error}</p>}
        <button className="primary-button wide" type="button" disabled={!ready || running} onClick={run}>
          {running ? "Working on it…" : !workerReady ? "Not available yet" : passwordProblem && selected.length >= minFiles ? (o.password ? passwordProblem : "Enter a password") : ready ? info.verb : multi ? `Select ${minFiles === 2 ? "two or more files" : "at least one file"}` : "Choose a PDF first"}
        </button>
      </section>

      {results && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h3>Done: {results.length} file{results.length === 1 ? "" : "s"} saved to Files</h3>
              <p>{note ? `${note} ` : ""}Your original{multi ? "s are" : " is"} unchanged.</p>
            </div>
            <Link className="quiet-button with-icon" href="/files">Open Files</Link>
          </div>
          <ul className="file-list">
            {results.map((f) => (
              <li key={f.id} className="file-row">
                <span className="file-icon">{f.mimeType === "application/zip" ? <FileArchive size={17} /> : f.mimeType.startsWith("image/") ? <ImageIcon size={17} /> : <FileText size={17} />}</span>
                <span className="file-meta"><strong title={f.name}>{f.name}</strong><span>{f.pages ? `${f.pages} page${f.pages === 1 ? "" : "s"} · ` : ""}{formatBytes(f.byteSize)}</span></span>
                <span className="file-actions">
                  {f.mimeType === PDF_MIME && (
                    <Link className="icon-button" href={`/tools/documents?file=${f.id}`} aria-label={`Open ${f.name} in Document Genius`} title="Open in Document Genius"><Sparkles size={16} /></Link>
                  )}
                  <button type="button" className="secondary-button" disabled={downloading === f.id} onClick={() => download(f)}>
                    <Download size={15} /> {downloading === f.id ? "Preparing…" : "Download"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
