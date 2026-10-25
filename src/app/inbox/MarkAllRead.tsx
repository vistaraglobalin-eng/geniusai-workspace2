"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

export function MarkAllRead() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="secondary-button with-icon" disabled={busy} onClick={async () => {
      setBusy(true);
      await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
      setBusy(false); startTransition(() => router.refresh());
    }}><CheckCheck size={16} aria-hidden="true" /> Mark all as read</button>
  );
}
