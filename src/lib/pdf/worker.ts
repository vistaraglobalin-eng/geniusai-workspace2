import "server-only";
import type { WorkerTool } from "./catalog";

// Client for the GeniusAI PDF worker (see /pdf-worker). Server-side only: the
// shared secret must never reach the browser.

export class WorkerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WorkerError";
    this.status = status;
  }
}

export function isWorkerConfigured(): boolean {
  return Boolean(process.env.PDF_WORKER_URL && (process.env.PDF_WORKER_SECRET ?? "").length >= 32);
}

export type WorkerOutput = { name: string; mime: string; bytes: Uint8Array };

export async function runWorkerTool(
  tool: WorkerTool,
  file: { name: string; mime: string; bytes: Uint8Array },
  options: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<{ files: WorkerOutput[]; note?: string }> {
  const url = process.env.PDF_WORKER_URL;
  const secret = process.env.PDF_WORKER_SECRET;
  if (!url || !secret || secret.length < 32) throw new WorkerError(503, "This tool isn't set up on the server yet.");

  let res: Response;
  try {
    res = await fetchImpl(`${url.replace(/\/+$/, "")}/v1/run`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      // Options (including passwords) go in the body, never in headers or the URL.
      body: JSON.stringify({ tool, options, file: { name: file.name, mime: file.mime, base64: Buffer.from(file.bytes).toString("base64") } }),
      signal: AbortSignal.timeout(280_000)
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new WorkerError(timedOut ? 504 : 503, timedOut ? "This file took too long to process." : "The PDF service can't be reached right now. Please try again shortly.");
  }

  let data: { files?: { name: string; mime: string; base64: string }[]; note?: string; message?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* fall through */
  }
  if (!res.ok || !Array.isArray(data.files)) {
    if (res.status === 401) throw new WorkerError(503, "The PDF service is misconfigured (secret mismatch).");
    const userFacing = res.status === 413 || res.status === 422 || res.status === 503 || res.status === 504;
    throw new WorkerError(userFacing ? res.status : 502, userFacing && data.message ? data.message : "Processing failed. Please try again.");
  }
  return {
    files: data.files.map((f) => ({ name: f.name, mime: f.mime, bytes: new Uint8Array(Buffer.from(f.base64, "base64")) })),
    note: typeof data.note === "string" ? data.note.slice(0, 300) : undefined
  };
}
