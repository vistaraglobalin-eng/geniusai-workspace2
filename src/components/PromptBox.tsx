"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { MAX_PROMPT_CHARS } from "@/lib/agreements/prompts";
import { VoiceButton, appendSpoken } from "@/components/VoiceButton";

const EXAMPLES = [
  "Rental agreement for a 2BHK in Pune, ₹28,000 rent, 11 months",
  "Mutual NDA with a software vendor in Bengaluru",
  "Freelance logo design contract, ₹40,000 in two parts"
];

/** "Describe what you need" box. Signed-out visitors go through sign-in and land back here with the text. */
export function PromptBox({ heading = "Describe the agreement you need", compact = false }: { heading?: string; compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    const t = text.trim();
    if (t.length < 10) { setError("Add a little more detail (a sentence is enough)."); return; }
    router.push(`/tools/agreements/new?prompt=${encodeURIComponent(t.slice(0, MAX_PROMPT_CHARS))}`);
  }

  return (
    <form className={`prompt-box${compact ? " compact" : ""}`} onSubmit={submit}>
      <label htmlFor="agreement-prompt" className="prompt-label">{heading}</label>
      <div className="prompt-field">
        <textarea
          id="agreement-prompt"
          rows={compact ? 2 : 3}
          maxLength={MAX_PROMPT_CHARS}
          value={text}
          placeholder={compact ? "e.g. Mutual NDA with a vendor in Pune" : "e.g. A service agreement for a freelance developer building our app, ₹1.5 lakh, 3 milestones…"}
          onChange={(e: { target: { value: string } }) => { setText(e.target.value); setError(null); }}
          aria-describedby={error ? "prompt-error" : undefined}
        />
        <VoiceButton onText={(s) => { setText((prev) => appendSpoken(prev, s)); setError(null); }} />
        <button type="submit" className="primary-button"><Wand2 size={16} aria-hidden="true" /> Draft it</button>
      </div>
      {error && <p className="form-message error" id="prompt-error" role="alert">{error}</p>}
      {!compact && (
        <div className="chip-row" aria-label="Examples">
          {EXAMPLES.map((ex) => <button type="button" key={ex} className="chip" onClick={() => setText(ex)}>{ex}</button>)}
        </div>
      )}
    </form>
  );
}
