"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Download, PenLine, XCircle } from "lucide-react";
import { renderPdfPages, type PageView } from "@/lib/pdf/preview";
import { SignaturePad, type Signature } from "@/app/tools/sign/SignaturePad";
import { ShareButton, urlSource } from "@/components/ShareSheet";

type Field = { page: number; x: number; y: number; w: number; h: number; kind: "signature" | "name" | "date" };
type Props = {
  token: string; title: string; documentName: string; sender: string; message: string | null; signerName: string;
  fields: Field[]; position: number; total: number; block: { code: string; message: string } | null; completed: boolean;
};

const today = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date());

/** Names in non-Latin scripts (Hindi, Punjabi…) are drawn by the browser so they appear correctly on the PDF. */
function namePng(text: string): string | null {
  if (!/[^\x00-\x7F]/.test(text)) return null;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const size = 48;
  ctx.font = `${size}px system-ui, sans-serif`;
  c.width = Math.ceil(ctx.measureText(text).width) + 8; c.height = Math.ceil(size * 1.4);
  ctx.font = `${size}px system-ui, sans-serif`;
  ctx.fillStyle = "#141a33"; ctx.textBaseline = "middle";
  ctx.fillText(text, 4, c.height / 2);
  return c.toDataURL("image/png");
}

export function SignerView(p: Props) {
  const [pages, setPages] = useState<PageView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [typedName, setTypedName] = useState(p.signerName);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { completed: boolean }>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [declined, setDeclined] = useState(false);
  const [completedUrl, setCompletedUrl] = useState<string | null>(null);
  const padRef = useRef<HTMLElement | null>(null);
  const canSign = !p.block;

  async function open() {
    const res = await fetch("/api/sign-requests/public/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: p.token }) });
    return (await res.json().catch(() => ({}))) as { url?: string | null; completedUrl?: string | null; message?: string };
  }

  useEffect(() => {
    if (!canSign) {
      if (p.completed) open().then((d) => setCompletedUrl(d.completedUrl ?? null)).catch(() => undefined);
      return;
    }
    let cancelled = false;
    const slow = setTimeout(() => { if (!cancelled) setLoadError((e) => e ?? "The document is taking too long to open. Check your connection and reload this page."); }, 45000);
    (async () => {
      try {
        const d = await open();
        if (!d.url) throw new Error(d.message ?? "missing");
        const bytes = new Uint8Array(await (await fetch(d.url)).arrayBuffer());
        await renderPdfPages(bytes, { maxPages: 80, isCancelled: () => cancelled, onProgress: (pg) => setPages(pg) });
        clearTimeout(slow);
      } catch { if (!cancelled) setLoadError("The document couldn't be opened. Check your connection and reload this page."); }
    })();
    return () => { cancelled = true; clearTimeout(slow); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sign() {
    setError(null);
    if (!signature) { setError("Draw or type your signature first."); padRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (typedName.trim().length < 2) { setError("Type your full name."); return; }
    if (!consent) { setError("Please tick the box to agree to sign electronically."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/sign-requests/public/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: p.token, signature: signature.dataUrl, typedName, namePng: namePng(typedName.trim()), consent: true })
      });
      const data = (await res.json().catch(() => ({}))) as { completed?: boolean; message?: string };
      if (res.ok) {
        setDone({ completed: !!data.completed });
        if (data.completed) open().then((d) => setCompletedUrl(d.completedUrl ?? null)).catch(() => undefined);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else setError(data.message ?? "Your signature couldn't be saved. Please try again.");
    } catch { setError("The connection dropped. Reload this page to check whether your signature was saved."); }
    finally { setBusy(false); }
  }

  async function decline() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/sign-requests/public/decline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: p.token, reason }) });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) setDeclined(true); else setError(data.message ?? "That didn't work. Please try again.");
    } catch { setError("The connection dropped. Please try again."); }
    finally { setBusy(false); }
  }

  const downloadBtn = completedUrl && (
    <div className="dg-result-actions">
      <a className="primary-button" href={completedUrl}><Download size={16} aria-hidden="true" /> Download the signed PDF</a>
      <ShareButton source={urlSource(completedUrl, `${p.documentName.replace(/\.pdf$/i, "")} (signed).pdf`, "application/pdf")} />
    </div>
  );

  if (declined) return <Card icon={<XCircle size={36} aria-hidden="true" />} title="You declined to sign" text={`We've let ${p.sender} know.`} />;
  if (done) {
    return (
      <Card icon={<CheckCircle2 size={36} aria-hidden="true" />} title="Thank you, you've signed"
        text={done.completed ? "Everyone has now signed. You can download your copy below." : `${p.sender} will receive the signed document once everyone has signed. You can close this page.`}>
        {downloadBtn}
      </Card>
    );
  }
  if (p.block) {
    const good = p.block.code === "signed" || p.block.code === "completed";
    return <Card icon={good ? <CheckCircle2 size={36} aria-hidden="true" /> : <XCircle size={36} aria-hidden="true" />} title={p.title} text={p.block.message}>{downloadBtn}</Card>;
  }

  const sigFields = p.fields.filter((f) => f.kind === "signature").length;

  return (
    <div className="sr-signer-view">
      <section className="panel-card sr-intro">
        <p className="sr-kicker">{p.sender} asked you to sign</p>
        <h1>{p.title}</h1>
        <p className="field-hint">{p.documentName}{p.total > 1 ? ` · signer ${p.position} of ${p.total}` : ""} · {sigFields} signature{sigFields === 1 ? "" : "s"} needed</p>
        {p.message && <p className="sr-message">“{p.message}”</p>}
        <a className="quiet-button with-icon" href="#sr-sign"><ChevronDown size={15} aria-hidden="true" /> Review, then sign below</a>
      </section>

      <section className="sign-preview sr-doc" aria-label="Document">
        {loadError && <p className="form-message error" role="alert">{loadError}</p>}
        {!loadError && pages.length === 0 && <p className="dg-hint" role="status">Opening the document…</p>}
        {pages.map((pg) => (
          <figure key={pg.number} className="sign-page-wrap">
            <div className="sign-page" style={{ aspectRatio: `${pg.width} / ${pg.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pg.url} alt={`Page ${pg.number}`} draggable={false} />
              {p.fields.filter((f) => f.page === pg.number).map((f, i) => (
                <div key={i} className={`sr-field mine ${f.kind}${(f.kind === "signature" ? signature : true) ? " filled" : ""}`}
                  style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
                  {f.kind === "signature"
                    ? (signature ? <img src={signature.dataUrl} alt="Your signature" /> : <a href="#sr-sign" className="sr-field-label"><PenLine size={11} aria-hidden="true" /> Sign here</a>)
                    : <span className="sr-field-text">{f.kind === "date" ? today() : typedName}</span>}
                </div>
              ))}
            </div>
            <figcaption>Page {pg.number}</figcaption>
          </figure>
        ))}
      </section>

      <section id="sr-sign" ref={padRef} className="panel-card sr-sign-card">
        <h2>Your signature</h2>
        <SignaturePad defaultName={p.signerName} onChange={(s) => { setSignature(s); if (s) setError(null); }} doneHint="Looks good? It's shown on the document above." />
        <div className="field">
          <label htmlFor="sr-name">Your full name</label>
          <input id="sr-name" className="text-input" value={typedName} maxLength={120} autoComplete="name"
            onChange={(e: { target: { value: string } }) => setTypedName(e.target.value)} />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={consent} onChange={() => setConsent((v) => !v)} />
          <span>I have reviewed this document, agree to sign it electronically, and intend the signature I add to be my signature on it.</span>
        </label>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <button type="button" className="primary-button wide" onClick={sign} disabled={busy || pages.length === 0}>
          <PenLine size={16} aria-hidden="true" /> {busy ? "Signing…" : "Sign the document"}
        </button>
        <p className="field-hint">Your name, the time, your IP address and device are recorded on a signing certificate attached to the final PDF, which {p.sender} receives. See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
        {!declining ? (
          <button type="button" className="quiet-button sr-decline" onClick={() => setDeclining(true)}>I don&apos;t want to sign</button>
        ) : (
          <div className="sr-decline-box">
            <label htmlFor="sr-reason">Tell {p.sender} why (optional)</label>
            <textarea id="sr-reason" className="text-input" rows={2} maxLength={500} value={reason} onChange={(e: { target: { value: string } }) => setReason(e.target.value)} />
            <div className="dg-result-actions">
              <button type="button" className="secondary-button" onClick={() => setDeclining(false)} disabled={busy}>Back</button>
              <button type="button" className="quiet-button with-icon danger" onClick={decline} disabled={busy}><XCircle size={15} aria-hidden="true" /> Decline to sign</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <section className="panel-card sign-done sr-public-card" aria-live="polite">
      {icon}
      <h1>{title}</h1>
      <p>{text}</p>
      {children}
    </section>
  );
}
