"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type } from "lucide-react";

export type Signature = { dataUrl: string; aspect: number }; // aspect = width / height

const INKS = [
  { label: "Blue", color: "#1d3fbf" },
  { label: "Black", color: "#111827" }
] as const;

const FONTS = [
  { label: "Script", css: '"Segoe Script", "Snell Roundhand", "Brush Script MT", cursive' },
  { label: "Elegant", css: '"Apple Chancery", "Lucida Handwriting", "URW Chancery L", cursive' },
  { label: "Simple", css: '"Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive' }
] as const;

/** Crops the transparent margins so the signature fills its box on the PDF. */
function trimmed(canvas: HTMLCanvasElement): Signature | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d")?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { dataUrl: out.toDataURL("image/png"), aspect: w / h };
}

export function SignaturePad({ defaultName, onChange }: { defaultName: string; onChange: (s: Signature | null) => void }) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [ink, setInk] = useState<string>(INKS[0].color);
  const [typed, setTyped] = useState(defaultName);
  const [font, setFont] = useState<string>(FONTS[0].css);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  // Size the canvas to its box at device resolution.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d");
    if (ctx) { ctx.scale(dpr, dpr); ctx.lineCap = "round"; ctx.lineJoin = "round"; }
    setHasInk(false);
    onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Typed signature: redraw whenever the text, font or ink changes.
  useEffect(() => {
    if (mode !== "type") return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const r = c.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    const text = typed.trim().slice(0, 60);
    if (!text) { onChange(null); return; }
    let size = 56;
    ctx.font = `${size}px ${font}`;
    while (ctx.measureText(text).width > r.width - 24 && size > 18) { size -= 2; ctx.font = `${size}px ${font}`; }
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 12, r.height / 2);
    onChange(trimmed(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed, font, ink]);

  function point(e: { clientX: number; clientY: number }) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: { clientX: number; clientY: number; pointerId: number; preventDefault(): void }) {
    if (mode !== "draw") return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = point(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) { ctx.beginPath(); ctx.fillStyle = ink; ctx.arc(drawing.current.x, drawing.current.y, 1.4, 0, Math.PI * 2); ctx.fill(); }
  }
  function move(e: { clientX: number; clientY: number; preventDefault(): void }) {
    if (!drawing.current) return;
    e.preventDefault();
    const p = point(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(drawing.current.x, drawing.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawing.current = p;
    setHasInk(true);
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = null;
    if (canvasRef.current) onChange(trimmed(canvasRef.current));
  }
  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    if (mode === "type") setTyped("");
    onChange(null);
  }

  return (
    <div className="sig-pad">
      <div className="sig-tabs">
        <div className="segmented" role="tablist" aria-label="Signature type">
          <button type="button" role="tab" aria-selected={mode === "draw"} onClick={() => setMode("draw")}><PenLine size={15} aria-hidden="true" /> Draw</button>
          <button type="button" role="tab" aria-selected={mode === "type"} onClick={() => setMode("type")}><Type size={15} aria-hidden="true" /> Type</button>
        </div>
        <div className="sig-inks" role="radiogroup" aria-label="Ink colour">
          {INKS.map((i) => (
            <button key={i.color} type="button" role="radio" aria-checked={ink === i.color} aria-label={i.label} title={i.label}
              className="sig-ink" style={{ background: i.color }} onClick={() => setInk(i.color)} />
          ))}
        </div>
      </div>

      {mode === "type" && (
        <div className="sig-type-row">
          <label className="visually-hidden" htmlFor="sig-typed">Your name</label>
          <input id="sig-typed" className="text-input" value={typed} maxLength={60} placeholder="Type your name"
            onChange={(e: { target: { value: string } }) => setTyped(e.target.value)} />
          <div className="chip-row">
            {FONTS.map((f) => (
              <button key={f.label} type="button" className={`chip${font === f.css ? " active" : ""}`} style={{ fontFamily: f.css }} onClick={() => setFont(f.css)}>
                {typed.trim().split(" ")[0] || f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={`sig-canvas${mode === "draw" ? " drawable" : ""}`}
        aria-label={mode === "draw" ? "Signature drawing area. Draw your signature with your finger, pen or mouse." : "Typed signature preview"}
        role="img"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <div className="sig-foot">
        <span className="field-hint">{mode === "draw" ? (hasInk ? "Looks good? Now tap a page below to place it." : "Sign above with your finger, pen or mouse.") : "Pick the style you like."}</span>
        <button type="button" className="quiet-button with-icon" onClick={clear}><Eraser size={14} aria-hidden="true" /> Clear</button>
      </div>
    </div>
  );
}
