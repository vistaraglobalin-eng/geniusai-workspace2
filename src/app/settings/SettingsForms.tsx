"use client";

import { useActionState } from "react";
import { updateProfile, updateWorkspace, type FormState } from "./actions";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

function Status({ state, success }: { state: FormState; success: string }) {
  return (
    <span className={`inline-status ${state.error ? "error" : "success"}`} role={state.error ? "alert" : "status"}>
      {state.error ?? (state.ok ? success : "")}
    </span>
  );
}

export function ProfileForm({ displayName, email }: { displayName: string; email: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="displayName">Your name</label>
        <input id="displayName" name="displayName" className="text-input" defaultValue={displayName} maxLength={80} required autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" className="text-input" value={email ?? ""} disabled readOnly />
        <p className="field-hint">Used to sign in. Changing your email will come with a confirmation step.</p>
      </div>
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
        <Status state={state} success="Profile saved" />
      </div>
    </form>
  );
}

export function WorkspaceForm({
  workspace,
  canEdit
}: {
  workspace: { id: string; name: string; kind: "personal" | "business"; defaultCurrency: string };
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateWorkspace, {});
  return (
    <form action={action}>
      <input type="hidden" name="workspaceId" value={workspace.id} />
      {!canEdit && <p className="form-message warning">Only the workspace owner can change these settings.</p>}
      <div className="field">
        <label htmlFor="wsName">Workspace name</label>
        <input id="wsName" name="name" className="text-input" defaultValue={workspace.name} maxLength={80} required disabled={!canEdit} />
      </div>
      <div className="field">
        <label htmlFor="wsKind">Type</label>
        <select id="wsKind" name="kind" className="select-input" defaultValue={workspace.kind} disabled={!canEdit}>
          <option value="personal">Personal</option>
          <option value="business">Business</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="wsCurrency">Default currency</label>
        <select id="wsCurrency" name="currency" className="select-input" defaultValue={workspace.defaultCurrency} disabled={!canEdit}>
          {[...new Set([workspace.defaultCurrency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <p className="field-hint">Used for invoices and expenses.</p>
      </div>
      {canEdit && (
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save workspace"}</button>
          <Status state={state} success="Workspace saved" />
        </div>
      )}
    </form>
  );
}
