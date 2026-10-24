"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Eraser, ImagePlus, Paintbrush, RotateCcw, Save, Share2, Undo2, Wand2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet, type ShareSource } from "@/components/ShareSheet";
import { autoRemoveSmart, brush, featherEdges, keptShare, maskBounds, tapRemove, toLab, type Pixels } from "@/lib/photos/cutout";
import { DEFAULT_AD, FORMATS, TEMPLATES, renderDesign, type Background, type Design, type FormatKey } from "@/lib/photos/design";

const MAX_SIDE = 1600;
type Tool = "tap" | "erase" | "restore";

const SOLIDS = ["#ffffff", "#f2f2f5", "#fbf3e4", "#fde2e4", "#dff5ea", "#e0efff", "#fff5c2", "#14172b"];
const GRADIENTS: [string, string][] = [["#fdfbfb", "#e2e6ee"], ["#ffecd2", "#fcb69f"], ["#a1c4fd", "#c2e9fb"], ["#d4fc79", "#96e6a1"], ["#fbc2eb", "#a6c1ee"], ["#2b2d42", "#4f46e5"], ["#ff9a44", "#fc6076"], ["#141e30", "#243b55"]];
const ACCENTS = ["#4f46e5", "#e5392f", "#16a34a", "#ea7a00", "#c026d3", "#0e93a8", "#14172b", "#d4a017"];

function checker(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = Math.max(8, Math.round(Math.min(w, h) / 40));
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#e6e6ec";
  for (let y = 0; y < h; y += s) for (let x = (y / s) % 2 ? s : 0; x < w; x += s * 2) ctx.fillRect(x, y, s, s);
}

export function PhotoStudio({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState("product");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null); // source photo, max 1600px
  const [mask, setMask] = useState<Uint8ClampedArray | null>(null);
  const [history, setHistory] = useState<Uint8ClampedArray[]>([]);
  const [cutMode, setCutMode] = useState<"cut" | "original">("cut");
  const [tool, setTool] = useState<Tool>("erase");
  const [brushSize, setBrushSize] = useState(28);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [design, setDesign] = useState<Design>({ format: "marketplace", bg: { kind: "solid", color: "#ffffff" }, shadow: "none", scale: 1, dx: 0, dy: 0, ad: { ...DEFAULT_AD } });
  const [fileType, setFileType] = useState<"png" | "jpg">("jpg");
  const [saved, setSaved] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ShareSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pixels = useRef<Pixels | null>(null);
  const lab = useRef<Float32Array | null>(null);
  const editRef = useRef<HTMLCanvasElement | null>(null);
  const designRef = useRef<HTMLCanvasElement | null>(null);
  const painting = useRef(false);
  const working = useRef<Uint8ClampedArray | null>(null);
  const frame = useRef(0);
  const dragging = useRef<{ x: number; y: number; dx: number; dy: number; aw: number; ah: number } | null>(null);
  const layout = useRef<{ product: { x: number; y: number; w: number; h: number } | null; area: { w: number; h: number }; scale: number } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const setD = (patch: Partial<Design>) => { setDesign((d) => ({ ...d, ...patch })); setSaved(null); };
  const setAd = (patch: Partial<Design["ad"]>) => { setDesign((d) => ({ ...d, ad: { ...d.ad, ...patch } })); setSaved(null); };

  // The product image used in designs: cut-out (cropped to the product) or the whole photo.
  const product = useMemo(() => {
    if (!photo) return null;
    if (cutMode === "original" || !mask || !pixels.current) return photo;
    const { width: w, height: h, data } = pixels.current;
    const full = document.createElement("canvas"); full.width = w; full.height = h;
    const ctx = full.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const soft = featherEdges(mask, w, h);
    for (let i = 0; i < w * h; i++) { img.data[i * 4] = data[i * 4]; img.data[i * 4 + 1] = data[i * 4 + 1]; img.data[i * 4 + 2] = data[i * 4 + 2]; img.data[i * 4 + 3] = soft[i]; }
    ctx.putImageData(img, 0, 0);
    const b = maskBounds(mask, w, h);
    if (!b) return null;
    const out = document.createElement("canvas"); out.width = b.w; out.height = b.h;
    out.getContext("2d")!.drawImage(full, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return out;
  }, [photo, mask, cutMode]);

  async function loadFile(file: File) {
    setError(null); setNotice(null); setSaved(null);
    if (!file.type.startsWith("image/")) { setError("Choose a photo (JPG, PNG, WebP or HEIC)."); return; }
    setBusy("Opening photo…");
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      pixels.current = { data: id.data, width: c.width, height: c.height };
      lab.current = null;
      setName(file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "product");
      setPhoto(c); setMask(null); setHistory([]); setCutMode("cut");
      setD({ scale: 1, dx: 0, dy: 0 });
      // Remove the background straight away; people can switch back to the original.
      setTimeout(() => autoCut(), 30);
    } catch {
      setError("This photo couldn't be opened. Try a JPG or PNG.");
    } finally { setBusy(null); }
  }

  function getLab() {
    if (!lab.current && pixels.current) lab.current = toLab(pixels.current);
    return lab.current!;
  }

  function autoCut() {
    const px = pixels.current; if (!px) return;
    setBusy("Removing background…");
    setTimeout(() => {
      try {
        const { mask: m } = autoRemoveSmart(px, getLab());
        const share = keptShare(m);
        if (mask) setHistory((h) => [...h.slice(-14), mask]);
        setMask(m); setCutMode("cut"); setSaved(null);
        setNotice(share < 0.01 || share > 0.97
          ? "The background is too busy or too close to the product's colours to remove automatically. Use the brushes, or keep the original background."
          : "Background removed. Check the edges: use Erase or Restore to touch up, or tap a leftover area with Tap to remove.");
      } finally { setBusy(null); }
    }, 20);
  }

  function pushHistory() { if (mask) setHistory((h) => [...h.slice(-14), new Uint8ClampedArray(mask)]); }
  function undo() { setHistory((h) => { if (!h.length) return h; setMask(h[h.length - 1]); setSaved(null); return h.slice(0, -1); }); }

  // Draw the cut-out editor (checkerboard shows what will be removed).
  function drawEditor(m: Uint8ClampedArray | null) {
    const c = editRef.current, px = pixels.current;
    if (!c || !photo || !px) return;
    if (c.width !== px.width || c.height !== px.height) { c.width = px.width; c.height = px.height; }
    const ctx = c.getContext("2d")!;
    checker(ctx, c.width, c.height);
    if (!m || cutMode === "original") { ctx.drawImage(photo, 0, 0); return; }
    const img = new ImageData(new Uint8ClampedArray(px.data), px.width, px.height);
    for (let i = 0; i < m.length; i++) img.data[i * 4 + 3] = m[i];
    const tmp = document.createElement("canvas"); tmp.width = px.width; tmp.height = px.height;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }
  useEffect(() => { drawEditor(mask); }, [photo, mask, cutMode]); // eslint-disable-line react-hooks/exhaustive-deps

  function editPoint(e: { clientX: number; clientY: number }) {
    const c = editRef.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, k: c.width / r.width };
  }
  function editDown(e: { clientX: number; clientY: number; pointerId: number; currentTarget: { setPointerCapture(id: number): void }; preventDefault(): void }) {
    const px = pixels.current; if (!px || !mask || cutMode === "original") return;
    e.preventDefault();
    const p = editPoint(e);
    pushHistory();
    if (tool === "tap") { setMask(tapRemove(px, getLab(), mask, p.x, p.y, 40)); setSaved(null); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    painting.current = true;
    working.current = new Uint8ClampedArray(mask);
    brush(working.current, px.width, px.height, p.x, p.y, brushSize * p.k, tool === "restore");
    drawEditor(working.current);
  }
  function editMove(e: { clientX: number; clientY: number }) {
    const px = pixels.current, m = working.current; if (!painting.current || !px || !m) return;
    const p = editPoint(e);
    brush(m, px.width, px.height, p.x, p.y, brushSize * p.k, tool === "restore");
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; drawEditor(working.current); });
  }
  function editUp() {
    if (!painting.current) return;
    painting.current = false;
    if (working.current) { setMask(working.current); working.current = null; setSaved(null); }
  }

  // Draw the design preview.
  useEffect(() => {
    const c = designRef.current; if (!c) return;
    const f = FORMATS[design.format];
    const cssW = c.parentElement?.clientWidth || 360;
    const scale = Math.min(1, (cssW * Math.min(2, window.devicePixelRatio || 1)) / f.w);
    c.width = Math.round(f.w * scale); c.height = Math.round(f.h * scale);
    const ctx = c.getContext("2d")!;
    const r = renderDesign(ctx, c.width, c.height, design, product, photo);
    layout.current = { product: r.product, area: { w: r.area.w, h: r.area.h }, scale: c.width / c.getBoundingClientRect().width };
  }, [design, product, photo]);

  function designDown(e: { clientX: number; clientY: number; pointerId: number; currentTarget: { setPointerCapture(id: number): void } }) {
    const c = designRef.current, L = layout.current; if (!c || !L) return;
    const r = c.getBoundingClientRect(), k = c.width / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    const b = L.product;
    if (!b || x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX, y: e.clientY, dx: design.dx, dy: design.dy, aw: L.area.w / k, ah: L.area.h / k };
  }
  function designMove(e: { clientX: number; clientY: number }) {
    const d = dragging.current; if (!d) return;
    const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
    setD({ dx: clamp(d.dx + (e.clientX - d.x) / d.aw), dy: clamp(d.dy + (e.clientY - d.y) / d.ah) });
  }
  function designUp() { dragging.current = null; }

  async function exportBlob(): Promise<Blob> {
    const f = FORMATS[design.format];
    const c = document.createElement("canvas"); c.width = f.w; c.height = f.h;
    const ctx = c.getContext("2d")!;
    if (fileType === "jpg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, f.w, f.h); }
    renderDesign(ctx, f.w, f.h, design, product, photo);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, fileType === "jpg" ? "image/jpeg" : "image/png", 0.92));
    if (!blob) throw new Error("export");
    return blob;
  }
  const outName = () => `${name}-${design.ad.enabled ? "ad" : "photo"}-${design.format}.${fileType}`;

  async function saveToFiles() {
    setBusy("Saving to Files…"); setError(null);
    try {
      const blob = await exportBlob();
      const file = new File([blob], outName(), { type: blob.type });
      await uploadWorkspaceFile(createSupabaseBrowserClient(), { workspaceId, file, moduleKey: "creative" });
      setSaved(file.name);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "It couldn't be saved. Please try again.");
    } finally { setBusy(null); }
  }
  async function download() {
    const blob = await exportBlob();
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = outName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const bgIs = (b: Background) => JSON.stringify(b) === JSON.stringify(design.bg);
  const fmt = FORMATS[design.format];

  if (!photo) {
    return (
      <section className="panel-card ps-start">
        <div className="ps-start-icon"><ImagePlus size={30} aria-hidden="true" /></div>
        <h2>Start with a product photo</h2>
        <p>Take the photo on a plain, light background (a white wall or sheet works well) with good light. The background is removed on your phone; nothing is uploaded until you save.</p>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e: { target: { files: FileList | null; value: string } }) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
        <button type="button" className="primary-button" onClick={() => fileInput.current?.click()} disabled={!!busy}><ImagePlus size={17} aria-hidden="true" /> {busy ?? "Choose or take a photo"}</button>
        {error && <p className="form-message error" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <div className="ps-layout">
      <div className="ps-preview">
        <div className="ps-canvas-wrap" style={{ aspectRatio: `${fmt.w} / ${fmt.h}` }}>
          <canvas ref={designRef} className="ps-canvas" aria-label="Design preview. Drag the product to move it."
            onPointerDown={designDown} onPointerMove={designMove} onPointerUp={designUp} onPointerCancel={designUp} />
        </div>
        <p className="field-hint ps-hint">{fmt.label} · {fmt.w}×{fmt.h}px · drag the product to move it</p>
      </div>

      <div className="ps-controls">
        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Background removal</h2></div>
          <div className="segmented" role="radiogroup" aria-label="Product photo">
            <label className={cutMode === "cut" ? "selected" : ""}><input type="radio" name="ps-cut" checked={cutMode === "cut"} onChange={() => { setCutMode("cut"); if (!mask) autoCut(); }} /> Remove background</label>
            <label className={cutMode === "original" ? "selected" : ""}><input type="radio" name="ps-cut" checked={cutMode === "original"} onChange={() => { setCutMode("original"); setD({ bg: { kind: "original" } }); }} /> Keep original</label>
          </div>
          {cutMode === "cut" && (
            <>
              <div className="ps-edit-wrap">
                <canvas ref={editRef} className={`ps-edit ${tool}`} aria-label="Cut-out editor"
                  onPointerDown={editDown} onPointerMove={editMove} onPointerUp={editUp} onPointerCancel={editUp} />
              </div>
              <div className="ps-tools" role="radiogroup" aria-label="Touch-up tool">
                {([["erase", "Erase", Eraser], ["restore", "Restore", Paintbrush], ["tap", "Tap to remove", Wand2]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" role="radio" aria-checked={tool === k} className={`ps-tool${tool === k ? " selected" : ""}`} onClick={() => setTool(k)}><Icon size={16} aria-hidden="true" /> {label}</button>
                ))}
              </div>
              {tool !== "tap" && (
                <label className="ps-range">Brush size<input type="range" min={6} max={80} value={brushSize} onChange={(e: { target: { value: string } }) => setBrushSize(Number(e.target.value))} /></label>
              )}
              <div className="ps-row">
                <button type="button" className="quiet-button with-icon" onClick={undo} disabled={!history.length}><Undo2 size={15} aria-hidden="true" /> Undo</button>
                <button type="button" className="quiet-button with-icon" onClick={autoCut} disabled={!!busy}><RotateCcw size={15} aria-hidden="true" /> Redo automatically</button>
                <button type="button" className="quiet-button with-icon" onClick={() => fileInput.current?.click()}><ImagePlus size={15} aria-hidden="true" /> New photo</button>
              </div>
            </>
          )}
          {notice && cutMode === "cut" && <p className="field-hint">{notice}</p>}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e: { target: { files: FileList | null; value: string } }) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
        </section>

        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">2</span><h2>Size & background</h2></div>
          <div className="ps-chips" role="radiogroup" aria-label="Size">
            {(Object.keys(FORMATS) as FormatKey[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={design.format === k} className={`ps-chip${design.format === k ? " selected" : ""}`}
                onClick={() => setD({ format: k, ...(k === "marketplace" ? { bg: { kind: "solid", color: "#ffffff" } as Background, ad: { ...design.ad, enabled: false } } : {}) })}>
                <strong>{FORMATS[k].label}</strong><span>{FORMATS[k].note}</span>
              </button>
            ))}
          </div>
          <div className="ps-swatches" role="radiogroup" aria-label="Background">
            {SOLIDS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={bgIs({ kind: "solid", color: c })} aria-label={`Background ${c}`}
                className={`ps-swatch${bgIs({ kind: "solid", color: c }) ? " selected" : ""}`} style={{ background: c }} onClick={() => setD({ bg: { kind: "solid", color: c } })} />
            ))}
            {GRADIENTS.map(([a, b]) => (
              <button key={a + b} type="button" role="radio" aria-checked={bgIs({ kind: "gradient", from: a, to: b })} aria-label="Gradient background"
                className={`ps-swatch${bgIs({ kind: "gradient", from: a, to: b }) ? " selected" : ""}`} style={{ background: `linear-gradient(160deg, ${a}, ${b})` }} onClick={() => setD({ bg: { kind: "gradient", from: a, to: b } })} />
            ))}
            <label className="ps-swatch ps-custom" title="Any colour" aria-label="Pick any colour">
              <input type="color" value={design.bg.kind === "solid" ? design.bg.color : "#ffffff"} onChange={(e: { target: { value: string } }) => setD({ bg: { kind: "solid", color: e.target.value } })} />
            </label>
            <button type="button" role="radio" aria-checked={design.bg.kind === "original"} className={`ps-swatch ps-orig${design.bg.kind === "original" ? " selected" : ""}`} onClick={() => setD({ bg: { kind: "original" } })}>Photo</button>
          </div>
          {design.format === "marketplace" && !(design.bg.kind === "solid" && design.bg.color === "#ffffff") && (
            <p className="field-hint">Amazon and Flipkart main images need a pure white background.</p>
          )}
          <div className="segmented" role="radiogroup" aria-label="Shadow">
            {([["none", "No shadow"], ["soft", "Soft shadow"], ["floor", "Floor shadow"]] as const).map(([k, l]) => (
              <label key={k} className={design.shadow === k ? "selected" : ""}><input type="radio" name="ps-shadow" checked={design.shadow === k} onChange={() => setD({ shadow: k })} /> {l}</label>
            ))}
          </div>
          <label className="ps-range">Product size<input type="range" min={30} max={130} value={Math.round(design.scale * 100)} onChange={(e: { target: { value: string } }) => setD({ scale: Number(e.target.value) / 100 })} /></label>
          <button type="button" className="quiet-button" onClick={() => setD({ dx: 0, dy: 0, scale: 1 })}>Centre the product</button>
        </section>

        {design.format !== "marketplace" && (
          <section className="panel-card dg-step">
            <div className="dg-step-head"><span className="dg-step-num">3</span><h2>Make it an ad</h2></div>
            <label className="check-row"><input type="checkbox" checked={design.ad.enabled} onChange={() => setAd({ enabled: !design.ad.enabled })} /> Add a headline, price and button</label>
            {design.ad.enabled && (
              <>
                <div className="segmented" role="radiogroup" aria-label="Ad style">
                  {TEMPLATES.map((t) => (
                    <label key={t.key} className={design.ad.template === t.key ? "selected" : ""}><input type="radio" name="ps-tpl" checked={design.ad.template === t.key} onChange={() => setAd({ template: t.key })} /> {t.label}</label>
                  ))}
                </div>
                <div className="ps-swatches" role="radiogroup" aria-label="Accent colour">
                  {ACCENTS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={design.ad.accent === c} aria-label={`Accent ${c}`}
                      className={`ps-swatch small${design.ad.accent === c ? " selected" : ""}`} style={{ background: c }} onClick={() => setAd({ accent: c })} />
                  ))}
                </div>
                <div className="ps-fields">
                  <label className="field">Headline<input className="text-input" maxLength={60} value={design.ad.headline} placeholder="Pure Forest Honey" onChange={(e: { target: { value: string } }) => setAd({ headline: e.target.value })} /></label>
                  <label className="field">Line under it<input className="text-input" maxLength={70} value={design.ad.sub} placeholder="100% natural · Lab tested" onChange={(e: { target: { value: string } }) => setAd({ sub: e.target.value })} /></label>
                  <div className="ps-two">
                    <label className="field">Price<input className="text-input" maxLength={14} value={design.ad.price} placeholder="₹499" onChange={(e: { target: { value: string } }) => setAd({ price: e.target.value })} /></label>
                    <label className="field">Old price<input className="text-input" maxLength={14} value={design.ad.oldPrice} placeholder="₹799" onChange={(e: { target: { value: string } }) => setAd({ oldPrice: e.target.value })} /></label>
                  </div>
                  <div className="ps-two">
                    <label className="field">Offer badge<input className="text-input" maxLength={14} value={design.ad.badge} placeholder="40% OFF" onChange={(e: { target: { value: string } }) => setAd({ badge: e.target.value })} /></label>
                    <label className="field">Button<input className="text-input" maxLength={28} value={design.ad.cta} placeholder="Order on WhatsApp" onChange={(e: { target: { value: string } }) => setAd({ cta: e.target.value })} /></label>
                  </div>
                  <div className="ps-two">
                    <label className="field">Brand<input className="text-input" maxLength={30} value={design.ad.brand} placeholder="Vistara Naturals" onChange={(e: { target: { value: string } }) => setAd({ brand: e.target.value })} /></label>
                    <label className="field">Phone / website<input className="text-input" maxLength={40} value={design.ad.contact} placeholder="98xxxxxx10" onChange={(e: { target: { value: string } }) => setAd({ contact: e.target.value })} /></label>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        <section className="panel-card dg-step">
          <div className="dg-step-head"><span className="dg-step-num">{design.format === "marketplace" ? 3 : 4}</span><h2>Save & share</h2></div>
          <div className="segmented" role="radiogroup" aria-label="File type">
            <label className={fileType === "jpg" ? "selected" : ""}><input type="radio" name="ps-type" checked={fileType === "jpg"} onChange={() => setFileType("jpg")} /> JPG (smaller)</label>
            <label className={fileType === "png" ? "selected" : ""}><input type="radio" name="ps-type" checked={fileType === "png"} onChange={() => setFileType("png")} /> PNG (sharpest)</label>
          </div>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <div className="ps-row">
            <button type="button" className="primary-button" onClick={saveToFiles} disabled={!!busy || !product}>
              {saved ? <><Check size={16} aria-hidden="true" /> Saved to Files</> : <><Save size={16} aria-hidden="true" /> Save to Files</>}
            </button>
            <button type="button" className="secondary-button" disabled={!product}
              onClick={() => setSharing({ name: outName(), mime: fileType === "jpg" ? "image/jpeg" : "image/png", getBlob: exportBlob })}><Share2 size={16} aria-hidden="true" /> Share</button>
            <button type="button" className="quiet-button with-icon" onClick={download} disabled={!product}><Download size={16} aria-hidden="true" /> Download</button>
          </div>
          {saved && <p className="field-hint">{saved} is in your Files.</p>}
        </section>
      </div>

      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {sharing && <ShareSheet source={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}
