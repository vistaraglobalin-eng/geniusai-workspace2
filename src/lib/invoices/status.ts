/** Label for a document status pill. */
export function statusText(status: string, kind: string) {
  const map: Record<string, string> = { draft: "Draft", unpaid: "Unpaid", partly_paid: "Part paid", paid: "Paid", cancelled: "Cancelled", sent: "Sent", accepted: "Accepted", declined: "Declined", issued: kind === "receipt" ? "Received" : "Issued" };
  return map[status] ?? status;
}
