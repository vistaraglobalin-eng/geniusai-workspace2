"use client";

import { useActionState, useState } from "react";
import { User, Building2, ArrowRight } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "./actions";

const CURRENCIES = [
  { code: "INR", label: "INR · Indian rupee" },
  { code: "USD", label: "USD · US dollar" },
  { code: "EUR", label: "EUR · Euro" },
  { code: "GBP", label: "GBP · British pound" },
  { code: "AED", label: "AED · UAE dirham" },
  { code: "SGD", label: "SGD · Singapore dollar" },
  { code: "AUD", label: "AUD · Australian dollar" },
  { code: "CAD", label: "CAD · Canadian dollar" }
];

export function OnboardingForm({ defaultName, defaultCurrency }: { defaultName: string; defaultCurrency: string }) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});
  const [kind, setKind] = useState<"personal" | "business">("personal");
  const [name, setName] = useState(defaultName);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceTouched, setWorkspaceTouched] = useState(false);

  const suggested = kind === "business" ? "" : name.trim() ? `${name.trim().split(/\s+/)[0]}'s workspace` : "";
  const workspaceValue = workspaceTouched ? workspaceName : suggested;

  return (
    <form className="auth-form" action={formAction}>
      <label htmlFor="displayName">Your name</label>
      <input id="displayName" name="displayName" autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />

      <fieldset className="choice-row">
        <legend>Who is this workspace for?</legend>
        <label className={`choice ${kind === "personal" ? "selected" : ""}`}>
          <input type="radio" name="kind" value="personal" checked={kind === "personal"} onChange={() => setKind("personal")} />
          <User size={18} aria-hidden="true" /> <span><strong>Just me</strong><small>Personal documents and career</small></span>
        </label>
        <label className={`choice ${kind === "business" ? "selected" : ""}`}>
          <input type="radio" name="kind" value="business" checked={kind === "business"} onChange={() => setKind("business")} />
          <Building2 size={18} aria-hidden="true" /> <span><strong>A business</strong><small>Invoices, contracts and a team</small></span>
        </label>
      </fieldset>

      <label htmlFor="workspaceName">{kind === "business" ? "Business name" : "Workspace name"}</label>
      <input
        id="workspaceName"
        name="workspaceName"
        maxLength={80}
        required
        placeholder={kind === "business" ? "e.g. Acme Traders" : "e.g. My workspace"}
        value={workspaceValue}
        onChange={(e) => {
          setWorkspaceTouched(true);
          setWorkspaceName(e.target.value);
        }}
      />

      <label htmlFor="currency">Currency for invoices and expenses</label>
      <select id="currency" name="currency" defaultValue={defaultCurrency}>
        {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>

      {state.error && <p className="form-message error" role="alert">{state.error}</p>}
      <button className="primary-button wide" type="submit" disabled={pending}>
        {pending ? "Setting up…" : <>Create my workspace <ArrowRight size={16} /></>}
      </button>
    </form>
  );
}
