/** Puts files into a space (null = no space). Returns an error message, or null when it worked. */
export async function moveToSpace(fileIds: string[], spaceId: string | null): Promise<string | null> {
  try {
    const res = await fetch("/api/files/move", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileIds, spaceId }) });
    if (res.ok) return null;
    const d = (await res.json().catch(() => ({}))) as { message?: string };
    return d.message ?? "The files couldn't be moved.";
  } catch { return "The connection dropped. Please try again."; }
}
