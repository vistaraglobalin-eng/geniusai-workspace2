"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileText, Printer, RefreshCcw, Save, Share2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { uploadWorkspaceFile } from "@/lib/storage/files";
import { ShareSheet } from "@/components/ShareSheet";
import { loadImages, type InvoiceSettings } from "@/lib/invoices/render";
import { ACCENTS, CARD_DESIGNS, CARD_H, CARD_W, cardCanvas, cardFromSettings, cardPng, printShopPdf, sheetPdf, type CardData, type QrKind } from "@/lib/cards/card";
import { LETTERHEAD_STYLES, PAGE_H, PAGE_W, buildLetterPdf, layoutLetter, type LetterheadStyle } from "@/lib/letters/render";

type Val = { target: { value: string } };
type Img = HTMLImageElement | ImageBitmap | null;
const KEY = "ga.card.v1";

function CardView({ side, data, settings, logo }: { side: "front" | "back"; data: CardData; settings: InvoiceSettings; logo: Img }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = ref.current; if (!c) return;
      const scale = Math.min(1, ((c.clientWidth || 360) * Math.min(2, window.devicePixelRatio || 1)) / CARD_W);
      c.width = Math.round(CARD_W * scale); c.height = Math.round(CARD_H * scale);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(cardCanvas(side, data, settings, logo, 0, scale), 0, 0);
    }, 60);
    return () => clearTimeout(t);
  }, [side, data, settings, logo]);
  return <canvas ref={ref} className="vc-canvas" aria-label={`Card ${side}`} />;
}

function LetterheadView({ settings, style }: { settings: InvoiceSettings; style: LetterheadStyle }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const images = await loadImages(settings);
      const c = ref.current; if (off || !c) return;
      const L = layoutLetter([], settings, images, style);
      const scale = Math.min(1, ((c.clientWidth || 360) * Math.min(2, window.devicePixelRatio || 1)) / PAGE_W);
      c.width = Math.round(PAGE_W * scale); c.height = Math.round(PAGE_H * scale);
      const ctx = c.getContext("2d")!; ctx.setTransform(scale, 0, 0, scale, 0, 0);
      L.draw(ctx, 0);
    })();
    return () => { off = true; };
  }, [settings, style]);
  return <canvas ref={ref} className="inv-page lh-canvas" aria-label="Letterhead preview" />;
}

export function CardStudio({ workspaceId, settings, displayName, initialTab = "card" }: { workspaceId: string; settings: InvoiceSettings; displayName: string | null; initialTab?: "card" | "letterhead" }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<"card" | "letterhead">(initialTab);
  const [data, setData] = useState<CardData>(() => cardFromSettings(settings, displayName));
  const [logo, setLogo] = useState<Img>(null);
  const [lhStyle, setLhStyle] = useState<LetterheadStyle>("classic");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<{ name: string; mime: string; getBlob: () => Promise<Blob> } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { loadImages(settings).then((im) => setLogo(im.logo)); }, [settings]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setData((d) => ({ ...d, ...(JSON.parse(raw) as Partial<CardData>) }));
      const st = localStorage.getItem("ga.letterhead.style");
      if (st && LETTERHEAD_STYLES.some((x) => x.key === st)) setLhStyle(st as LetterheadStyle);
    } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } } }, [data, ready]);

  const set = <K extends keyof CardData>(k: K, v: CardData[K]) => setData((d) => ({ ...d, [k]: v }));
  const base = (data.name || data.business || "Visiting card").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(null); setMessage(null);
    try { await fn(); } catch { setError("That didn't work. Please try again."); } finally { setBusy(null); }
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  const letterheadPdf = () => buildLetterPdf([], settings, lhStyle, `${settings.business_name || "Business"} letterhead`);
  async function saveToFiles(blob: Blob, name: string) {
    await uploadWorkspaceFile(supabase, { workspaceId, file: new File([blob], name, { type: blob.type }), moduleKey: "creative" });
    setMessage(`Saved to Files: ${name}`);
  }

  const qrOptions: { key: QrKind; label: string; disabled?: boolean }[] = [
    { key: "contact", label: "Save contact" }, { key: "upi", label: "UPI payment", disabled: !settings.upi_id }, { key: "website", label: "Website", disabled: !data.website.trim() }, { key: "none", label: "No QR" }
  ];

  return (
    <>
      <nav className="segmented vc-tabs" aria-label="Make">
        <button type="button" aria-selected={tab === "card"} onClick={() => setTab("card")}>Visiting card</button>
        <button type="button" aria-selected={tab === "letterhead"} onClick={() => setTab("letterhead")}>Letterhead</button>
      </nav>
      {!settings.business_name && (
        <p className="form-message inline"><AlertTriangle size={16} aria-hidden="true" /> Add your business name, address and logo in <Link href="/tools/invoices/settings">Business details</Link> — they are used here.</p>
      )}

      {tab === "card" ? (
        <div className="inv-layout">
          <div className="inv-form">
            <section className="panel-card inv-card vc-preview">
              <CardView side="front" data={data} settings={settings} logo={logo} />
              <CardView side="back" data={data} settings={settings} logo={logo} />
            </section>
            <section className="panel-card inv-card">
              <h3>Design</h3>
              <div className="vc-designs" role="radiogroup" aria-label="Design">
                {CARD_DESIGNS.map((x) => (
                  <button key={x.key} type="button" role="radio" aria-checked={data.design === x.key} className={`vc-design${data.design === x.key ? " selected" : ""}`} onClick={() => set("design", x.key)}>
                    <CardView side="front" data={{ ...data, design: x.key }} settings={settings} logo={logo} />
                    <span>{x.label}</span>
                  </button>
                ))}
              </div>
              <div className="vc-colors" role="radiogroup" aria-label="Colour">
                {ACCENTS.map((c) => <button key={c} type="button" role="radio" aria-checked={data.accent === c} aria-label={c} className={`vc-color${data.accent === c ? " selected" : ""}`} style={{ background: c }} onClick={() => set("accent", c)} />)}
                <label className="vc-color custom" aria-label="Custom colour"><input type="color" value={data.accent} onChange={(e: Val) => set("accent", e.target.value)} /></label>
              </div>
            </section>
          </div>

          <aside className="inv-side">
            <section className="panel-card inv-card">
              <h3>Details</h3>
              <div className="lt-grid">
                <label className="field">Your name<input className="text-input" value={data.name} maxLength={60} onChange={(e: Val) => set("name", e.target.value)} placeholder="Vanish Kumar" /></label>
                <label className="field">Designation<input className="text-input" value={data.title} maxLength={60} onChange={(e: Val) => set("title", e.target.value)} placeholder="Founder & Director" /></label>
                <label className="field full">Business name<input className="text-input" value={data.business} maxLength={80} onChange={(e: Val) => set("business", e.target.value)} /></label>
                <label className="field full">Tagline (optional)<input className="text-input" value={data.tagline} maxLength={70} onChange={(e: Val) => set("tagline", e.target.value)} placeholder="Quality you can trust" /></label>
                <label className="field">Mobile<input className="text-input" type="tel" value={data.phone} maxLength={20} onChange={(e: Val) => set("phone", e.target.value)} /></label>
                <label className="field">Second number<input className="text-input" type="tel" value={data.phone2} maxLength={20} onChange={(e: Val) => set("phone2", e.target.value)} /></label>
                <label className="field full">Email<input className="text-input" type="email" value={data.email} maxLength={80} onChange={(e: Val) => set("email", e.target.value)} /></label>
                <label className="field full">Website<input className="text-input" value={data.website} maxLength={80} onChange={(e: Val) => set("website", e.target.value)} placeholder="www.example.in" /></label>
                <label className="field full">Address<input className="text-input" value={data.address} maxLength={140} onChange={(e: Val) => set("address", e.target.value)} /></label>
              </div>
              <h3>QR code on the back</h3>
              <nav className="segmented vc-qr" aria-label="QR code">
                {qrOptions.map((o) => <button key={o.key} type="button" aria-selected={data.qr === o.key} disabled={o.disabled} onClick={() => set("qr", o.key)}>{o.label}</button>)}
              </nav>
              <button type="button" className="quiet-button with-icon vc-reset" onClick={() => { setData({ ...cardFromSettings(settings, displayName), design: data.design, accent: data.accent }); }}><RefreshCcw size={14} aria-hidden="true" /> Refill from Business details</button>

              {error && <p className="form-message error" role="alert">{error}</p>}
              {message && <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {message}</p>}
              <div className="inv-actions">
                <button type="button" className="primary-button wide" disabled={!!busy} onClick={() => run("Making the print sheet…", async () => download(await sheetPdf(data, settings, logo), `${base} - A4 sheet.pdf`))}><Printer size={16} aria-hidden="true" /> A4 sheet to print (10 cards)</button>
                <div className="inv-row">
                  <button type="button" className="secondary-button" disabled={!!busy} onClick={() => run("Making the file…", async () => download(await printShopPdf(data, settings, logo), `${base} - print shop.pdf`))}><FileText size={16} aria-hidden="true" /> For print shop</button>
                  <button type="button" className="secondary-button" disabled={!!busy} onClick={() => setShare({ name: `${base} card.png`, mime: "image/png", getBlob: () => cardPng("front", data, settings, logo) })}><Share2 size={16} aria-hidden="true" /> Share card</button>
                </div>
                <div className="inv-row">
                  <button type="button" className="quiet-button with-icon" disabled={!!busy} onClick={() => run("Making images…", async () => { download(await cardPng("front", data, settings, logo), `${base} front.png`); download(await cardPng("back", data, settings, logo), `${base} back.png`); })}><Download size={15} aria-hidden="true" /> Images</button>
                  <button type="button" className="quiet-button with-icon" disabled={!!busy} onClick={() => run("Saving…", async () => saveToFiles(await printShopPdf(data, settings, logo), `${base} visiting card.pdf`))}><Save size={15} aria-hidden="true" /> Save to Files</button>
                </div>
              </div>
              <p className="lt-help">Size 3.5 × 2 in (89 × 51 mm). The print-shop file has 3 mm bleed. For the A4 sheet, print at 100% (Actual size); page 2 is the back for double-sided printing.</p>
            </section>
          </aside>
        </div>
      ) : (
        <div className="inv-layout">
          <div className="inv-form">
            <section className="panel-card inv-card"><LetterheadView settings={settings} style={lhStyle} /></section>
          </div>
          <aside className="inv-side">
            <section className="panel-card inv-card">
              <h3>Style</h3>
              <nav className="segmented" aria-label="Letterhead style">
                {LETTERHEAD_STYLES.filter((x) => x.key !== "none").map((x) => (
                  <button key={x.key} type="button" aria-selected={lhStyle === x.key} onClick={() => { setLhStyle(x.key); try { localStorage.setItem("ga.letterhead.style", x.key); } catch { /* ignore */ } }}>{x.label}</button>
                ))}
              </nav>
              <p className="lt-help">Uses your logo, business name, address, phone, email, website, GSTIN and PAN from <Link href="/tools/invoices/settings">Business details</Link>. Colour comes from your invoice colour.</p>
              {error && <p className="form-message error" role="alert">{error}</p>}
              {message && <p className="form-message success" role="status"><Check size={15} aria-hidden="true" /> {message}</p>}
              <div className="inv-actions">
                <button type="button" className="primary-button wide" disabled={!!busy} onClick={() => run("Making the PDF…", async () => download(await letterheadPdf(), "Letterhead.pdf"))}><Download size={16} aria-hidden="true" /> Letterhead PDF</button>
                <div className="inv-row">
                  <button type="button" className="secondary-button" disabled={!!busy} onClick={() => run("Making the Word file…", async () => download(await (await import("@/lib/letters/docx")).buildLetterDocx([], settings, lhStyle, "Letterhead"), "Letterhead.docx"))}><FileText size={16} aria-hidden="true" /> Word (type your letter)</button>
                  <button type="button" className="quiet-button with-icon" disabled={!!busy} onClick={() => setShare({ name: "Letterhead.pdf", mime: "application/pdf", getBlob: letterheadPdf })}><Share2 size={15} aria-hidden="true" /> Share</button>
                </div>
                <Link className="quiet-button with-icon" href="/tools/letters">Write a letter on it →</Link>
              </div>
            </section>
          </aside>
        </div>
      )}

      {busy && <div className="ps-busy" role="status"><span className="ps-spinner" aria-hidden="true" />{busy}</div>}
      {share && <ShareSheet source={share} onClose={() => setShare(null)} />}
    </>
  );
}
