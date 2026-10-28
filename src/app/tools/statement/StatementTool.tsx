"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Landmark } from "lucide-react";
import { UploadButton } from "@/components/UploadButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { track } from "@/lib/analytics";
import { byMode, parseStatement, statementCsv, type Statement } from "@/lib/statements/parse";
import { statementFileBase, statementXlsx } from "@/lib/statements/excel";

export type StatementFile = { id: string; name: string; byteSize: number };
export type StatementJob = { id: string; filename: string; credits: number; createdAt: string };

const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const PREVIEW_ROWS = 60;
const sizeOf = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const money = (n: number | null, cur: string) => (n === null ? "–" : new Intl.NumberFormat("en-IN", { style: "currency", currency: cur || "INR", maximumFractionDigits: 2 }).format(n));
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StatementTool({ workspaceId, files, history, creditsAvailable, initialFileId }: {
  workspaceId: string; files: StatementFile[]; history: StatementJob[]; creditsAvailable: number; initialFileId?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [fileId, setFileId] = useState<string | null>(initialFileId ?? files[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; buy?: boolean } | null>(null);
  const [result, setResult] = useState<{ s: Statement; truncated: boolean; credits?: number } | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const requestId = useRef<string>(crypto.randomUUID());
  const selected = files.find((f) => f.id === fileId) ?? null;

  async function convert() {
    if (!selected) return;
    setBusy(true); setError(null); setResult(null); setOnlyFlagged(false);
    try {
      const res = await fetch("/api/documents/statement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileId: selected.id, requestId: requestId.current }) });
      const data = (await res.json().catch(() => ({}))) as { statement?: Statement; truncated?: boolean; creditsCharged?: number; message?: string; error?: string };
      requestId.current = crypto.randomUUID();
      if (res.ok && data.statement) {
        setResult({ s: data.statement, truncated: Boolean(data.truncated), credits: data.creditsCharged });
        track("ai_task_completed", { task: "bank_statement", rows: data.statement.totals.count, mismatched: data.statement.checks.rowsMismatched, credits: data.creditsCharged });
      } else {
        setError({ text: data.message ?? "Something went wrong.", buy: data.error === "insufficient_credits" });
        track("ai_task_failed", { task: "bank_statement", reason: data.error ?? "unknown" });
      }
    } catch {
      setError({ text: "The connection dropped. Check Recent conversions below in a minute." });
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  async function open(job: StatementJob) {
    const { data } = await createSupabaseBrowserClient().from("ai_jobs").select("result").eq("id", job.id).maybeSingle();
    const r = (data as { result: { text?: string; truncated?: boolean } | null } | null)?.result;
    try {
      if (!r?.text) throw new Error("missing");
      setResult({ s: parseStatement(r.text), truncated: Boolean(r.truncated), credits: job.credits }); setError(null); setOnlyFlagged(false);
    } catch {
      setError({ text: "That conversion couldn't be loaded." });
    }
  }

  const s = result?.s;
  const rows = s ? (onlyFlagged ? s.txns.filter((t) => !t.ok) : s.txns) : [];
  const allGood = s ? s.checks.rowsMismatched === 0 && s.checks.closingMatches !== false : false;

  return (
    <div className="dg-layout">
      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">1</span><h2>Choose the statement</h2></div>
        <div className="dg-upload">
          <UploadButton workspaceId={workspaceId} moduleKey="invoices" accept={ACCEPT} label="Upload a statement"
            onUploaded={(f) => { setFileId(f.id); startTransition(() => router.refresh()); }} />
          <span className="dg-hint">PDF from net banking, or clear photos of a passbook or printed statement. Remove any password first with <Link href="/tools/pdf/unlock">Unlock PDF</Link>.</span>
        </div>
        {files.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Landmark size={22} aria-hidden="true" /></div><p>Upload a bank statement to convert.</p></div>
        ) : (
          <div className="dg-files" role="radiogroup" aria-label="Your files">
            {files.slice(0, 15).map((f) => (
              <label key={f.id} className={`dg-file${fileId === f.id ? " selected" : ""}`}>
                <input type="radio" name="statement-file" checked={fileId === f.id} onChange={() => setFileId(f.id)} />
                <span className="file-meta"><strong>{f.name}</strong><span>{sizeOf(f.byteSize)}</span></span>
              </label>
            ))}
          </div>
        )}
        <button type="button" className="primary-button wide" onClick={convert} disabled={!selected || busy}>
          <FileSpreadsheet size={16} aria-hidden="true" /> {busy ? "Reading every transaction… (up to 2 minutes)" : "Convert to Excel"}
        </button>
        <p className="field-hint">Usually 10–80 credits depending on pages; unused credits are returned. You have {creditsAvailable.toLocaleString("en-IN")}. Only the last 4 digits of the account number are kept.</p>
        {error && <p className="form-message error" role="alert">{error.text} {error.buy && <Link href="/billing">Buy credits</Link>}</p>}
      </section>

      <section className="panel-card dg-step">
        <div className="dg-step-head"><span className="dg-step-num">2</span><h2>What you get</h2></div>
        <ul className="bs-list">
          <li><strong>Transactions sheet:</strong> date, narration, payment mode, reference, debit, credit and balance, as real numbers and dates.</li>
          <li><strong>Every balance checked:</strong> each row is matched against the one before; anything that doesn&apos;t add up is highlighted.</li>
          <li><strong>Summary sheet:</strong> money in, money out, closing balance and totals by UPI, NEFT, IMPS, ATM, card, charges and more.</li>
          <li>Opens in Excel, Google Sheets and Tally imports. Also available as CSV.</li>
        </ul>
      </section>

      {s && (
        <section className="panel-card dg-result" aria-live="polite">
          <div className="dg-result-head">
            <div>
              <h2>{s.bank || "Bank statement"}{s.accountLast4 ? ` · XXXX${s.accountLast4}` : ""}</h2>
              <p className="field-hint">{day(s.periodFrom)} to {day(s.periodTo)} · {s.totals.count} transactions{result?.credits !== undefined ? ` · ${result.credits} credits used` : ""}</p>
            </div>
            <div className="dg-result-actions">
              <button type="button" className="primary-button with-icon" onClick={() => save(new Blob([statementXlsx(s)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${statementFileBase(s)}.xlsx`)}>
                <Download size={15} aria-hidden="true" /> Excel
              </button>
              <button type="button" className="quiet-button with-icon" onClick={() => save(new Blob([statementCsv(s)], { type: "text/csv;charset=utf-8" }), `${statementFileBase(s)}.csv`)}>
                <FileText size={15} aria-hidden="true" /> CSV
              </button>
            </div>
          </div>

          {result?.truncated && <p className="form-message warning">This statement is long, so some transactions at the end may be missing. Split the PDF into parts with PDF tools → Split, and convert each part.</p>}
          {allGood ? (
            <p className="form-message success"><CheckCircle2 size={16} aria-hidden="true" /><span>{s.checks.rowsChecked > 0 ? `All ${s.checks.rowsChecked} running balances add up${s.checks.closingMatches ? ", and the closing balance matches." : "."}` : "Converted. The statement doesn't print running balances, so rows couldn't be cross-checked."}</span></p>
          ) : (
            <p className="form-message warning"><AlertTriangle size={16} aria-hidden="true" /><span>
              {s.checks.rowsMismatched > 0 ? `${s.checks.rowsMismatched} row${s.checks.rowsMismatched === 1 ? "" : "s"} don't add up. ` : ""}
              {s.checks.closingMatches === false ? "Opening balance plus credits minus debits doesn't match the closing balance. " : ""}
              Compare the highlighted rows with the original before using the totals.
              {s.checks.rowsMismatched > 0 && <> <button type="button" className="link-button" onClick={() => setOnlyFlagged(!onlyFlagged)}>{onlyFlagged ? "Show all rows" : "Show only these rows"}</button></>}
            </span></p>
          )}

          <div className="bs-cards">
            <div><span>Opening</span><strong>{money(s.opening, s.currency)}</strong></div>
            <div><span>Money in</span><strong className="in">{money(s.totals.credit, s.currency)}</strong></div>
            <div><span>Money out</span><strong className="out">{money(s.totals.debit, s.currency)}</strong></div>
            <div><span>Closing</span><strong>{money(s.closing, s.currency)}</strong></div>
          </div>

          <div className="bs-modes">
            {byMode(s).slice(0, 8).map((m) => (
              <span key={m.mode} className="as-status muted">{m.mode} · {m.count}</span>
            ))}
          </div>

          <div className="bs-table-wrap" role="region" aria-label="Transactions" tabIndex={0}>
            <table className="bs-table">
              <thead><tr><th>Date</th><th>Narration</th><th>Mode</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((t, i) => (
                  <tr key={i} className={t.ok ? "" : "bad"}>
                    <td>{day(t.date)}</td>
                    <td className="desc">{t.description}{t.ref ? <span>{t.ref}</span> : null}</td>
                    <td>{t.mode}</td>
                    <td className="num">{t.debit ? t.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="num">{t.credit ? t.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="num">{t.balance === null ? "" : t.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW_ROWS && <p className="field-hint">Showing the first {PREVIEW_ROWS} of {rows.length}. Download Excel for all of them.</p>}
          <p className="dg-disclaimer">Read by AI and checked by maths. Always compare important figures with the original statement.</p>
        </section>
      )}

      {history.length > 0 && (
        <section className="panel-card dg-history">
          <div className="panel-title"><div><h3>Recent conversions</h3></div></div>
          <ul className="file-list">
            {history.map((j) => (
              <li key={j.id} className="file-row">
                <span className="file-icon"><FileSpreadsheet size={18} aria-hidden="true" /></span>
                <span className="file-meta"><strong>{j.filename}</strong><span>{new Date(j.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {j.credits} credits</span></span>
                <button type="button" className="link-button" onClick={() => open(j)}>Open</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
