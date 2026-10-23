"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { getTemplate, type Field } from "@/lib/agreements/templates";
import { DISCLAIMER, MAX_PROMPT_CHARS } from "@/lib/agreements/prompts";

function FieldInput({ field, value, error, onChange }: { field: Field; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `f-${field.key}`;
  const describedBy = [field.hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id, name: field.key, value, required: field.required, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value)
  };
  let control;
  if (field.type === "textarea") control = <textarea {...common} rows={3} className="text-input" placeholder={field.placeholder} maxLength={field.max} />;
  else if (field.type === "select") control = <select {...common} className="text-input">{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  else if (field.type === "date") control = <input {...common} type="date" className="text-input" />;
  else if (field.type === "number") control = <input {...common} type="number" inputMode="numeric" min={0} max={field.max} className="text-input" placeholder={field.placeholder} />;
  else if (field.type === "money") control = <input {...common} type="text" inputMode="decimal" className="text-input" placeholder={field.placeholder ?? "e.g. 25000"} />;
  else control = <input {...common} type="text" className="text-input" placeholder={field.placeholder} maxLength={field.max} />;
  return (
    <div className={`field${field.type === "textarea" ? " span-2" : ""}`}>
      <label htmlFor={id}>{field.label}{field.required ? <span aria-hidden="true"> *</span> : <span className="optional"> (optional)</span>}</label>
      {control}
      {field.hint && <span className="field-hint" id={`${id}-hint`}>{field.hint}</span>}
      {error && <span className="field-error" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

export function AgreementForm({ templateKey, initialPrompt, creditsAvailable }: { templateKey: string; initialPrompt: string; creditsAvailable: number }) {
  const router = useRouter();
  const template = getTemplate(templateKey);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((template?.fields ?? []).map((f) => [f.key, f.defaultValue ?? (f.type === "select" ? f.options?.[0] ?? "" : "")]))
  );
  const [prompt, setPrompt] = useState(initialPrompt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [busy, setBusy] = useState(false);
  // One id per draft attempt: a retry after a dropped connection reuses it, so it is never charged twice.
  const requestId = useRef<string>(crypto.randomUUID());

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true); setError(null); setErrors({}); setNeedsCredits(false);
    try {
      const res = await fetch("/api/agreements/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(template ? { templateKey, fields: values, requestId: requestId.current } : { templateKey: "custom", prompt, requestId: requestId.current })
      });
      const data = (await res.json().catch(() => ({}))) as { agreementId?: string; message?: string; error?: string; fieldErrors?: Record<string, string> };
      if (res.ok && data.agreementId) { router.push(`/tools/agreements/${data.agreementId}`); return; }
      if (data.fieldErrors) setErrors(data.fieldErrors);
      setNeedsCredits(data.error === "insufficient_credits");
      setError(data.message ?? "Something went wrong. Please try again.");
      // Validation problems never started a job; anything else gets a fresh id for the next try.
      if (data.error !== "invalid_fields" && data.error !== "short_prompt" && data.error !== "long_prompt" && data.error !== "save_failed") requestId.current = crypto.randomUUID();
    } catch {
      setError("The connection dropped while drafting. Press Draft again: you won't be charged twice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel-card as-form" onSubmit={submit} aria-busy={busy}>
      {template?.note && <p className="form-message warning">{template.note}</p>}
      {template ? (
        <div className="as-fields">
          {template.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} error={errors[f.key]} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
          ))}
        </div>
      ) : (
        <div className="field">
          <label htmlFor="custom-prompt">What should the document cover?</label>
          <textarea id="custom-prompt" className="text-input" rows={6} maxLength={MAX_PROMPT_CHARS} value={prompt}
            onChange={(e: { target: { value: string } }) => setPrompt(e.target.value)}
            placeholder="Who are the parties, what is being agreed, amounts, dates, city…" />
          <span className="field-hint">{prompt.length.toLocaleString("en-IN")} / {MAX_PROMPT_CHARS.toLocaleString("en-IN")} characters. Missing details become [placeholders] you can fill in later.</span>
        </div>
      )}
      {error && (
        <p className="form-message error" role="alert">
          {error} {needsCredits && <Link href="/billing">Buy credits</Link>}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={busy}>
          <Wand2 size={16} aria-hidden="true" /> {busy ? "Drafting… (up to a minute)" : "Draft with AI"}
        </button>
        <span className="field-hint">A draft usually uses 10–25 credits. About 45 are held while it’s written and the unused part is returned straight away. You have {creditsAvailable.toLocaleString("en-IN")}.</span>
      </div>
      <p className="dg-disclaimer">{DISCLAIMER}</p>
    </form>
  );
}
