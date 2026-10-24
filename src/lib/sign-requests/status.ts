/** Short status for a signature request, shown as a pill. */
export function statusLabel(r: { status: string; expires_at: string }, signed: number, total: number) {
  if (r.status === "completed") return { text: "Completed", tone: "final" };
  if (r.status === "finalizing") return { text: "Finishing", tone: "" };
  if (r.status === "declined") return { text: "Declined", tone: "bad" };
  if (r.status === "cancelled") return { text: "Cancelled", tone: "muted" };
  if (r.status === "expired" || new Date(r.expires_at).getTime() < Date.now()) return { text: "Expired", tone: "muted" };
  return { text: `${signed} of ${total} signed`, tone: "" };
}
