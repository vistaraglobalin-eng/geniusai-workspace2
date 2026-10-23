// GeniusAI PDF worker: a small HTTP service with no npm dependencies.
//
//   GET  /healthz           -> { ok, tools: { name: available } }   (no auth)
//   POST /v1/run            -> run a tool                            (Bearer auth)
//        body:  { tool, options, file: { name, mime, base64 } }
//        reply: { files: [{ name, mime, base64 }], note? }  or  { error, message }
//
// Only the GeniusAI web app calls this, with a shared secret. It never stores
// files: each job runs in its own temporary folder that is deleted afterwards.

import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AVAILABLE, OFFICE_EXT, TOOLS, ToolError, readOutput } from "./tools.mjs";

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.PDF_WORKER_SECRET || "";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil(MAX_FILE_BYTES * 1.4) + 64 * 1024; // base64 + JSON overhead
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 2));
const MAX_QUEUE = Math.max(0, Number(process.env.MAX_QUEUED_JOBS || 8));

if (SECRET.length < 32) {
  console.error("PDF_WORKER_SECRET must be set to a random value of at least 32 characters.");
  process.exit(1);
}

const secretDigest = createHash("sha256").update(SECRET).digest();
function authorized(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(createHash("sha256").update(token).digest(), secretDigest);
}

// Simple concurrency limit: heavy tools (LibreOffice, Ghostscript) use a lot of memory.
let active = 0;
const waiting = [];
async function withSlot(fn) {
  if (active >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_QUEUE) throw new ToolError("The PDF service is busy. Please try again in a minute.", 503);
    await new Promise((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json), "cache-control": "no-store" });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ToolError("This file is larger than 25 MB.", 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleRun(req, res) {
  if (!authorized(req)) return send(res, 401, { error: "unauthorized", message: "Unauthorized." });

  let body;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8"));
  } catch (err) {
    if (err instanceof ToolError) return send(res, err.status, { error: "too_large", message: err.message });
    return send(res, 400, { error: "bad_request", message: "Invalid request." });
  }

  const tool = TOOLS[body?.tool];
  if (!tool) return send(res, 400, { error: "unknown_tool", message: "Unknown tool." });
  const missing = tool.needs.filter((b) => !AVAILABLE[b]);
  if (missing.length) return send(res, 503, { error: "not_installed", message: `This tool needs ${missing.join(", ")} on the worker.` });

  const file = body.file ?? {};
  const bytes = typeof file.base64 === "string" ? Buffer.from(file.base64, "base64") : Buffer.alloc(0);
  if (bytes.length === 0) return send(res, 400, { error: "no_file", message: "No file was sent." });
  if (bytes.length > MAX_FILE_BYTES) return send(res, 413, { error: "too_large", message: "This file is larger than 25 MB." });

  let ext;
  if (tool.input === "pdf") {
    if (bytes.subarray(0, 1024).indexOf("%PDF-") === -1) return send(res, 422, { error: "not_pdf", message: "This file isn't a PDF." });
    ext = "pdf";
  } else {
    ext = OFFICE_EXT[file.mime];
    if (!ext) return send(res, 422, { error: "wrong_type", message: "This file type can't be converted to PDF." });
  }

  const options = body.options && typeof body.options === "object" ? body.options : {};
  const started = Date.now();
  try {
    const result = await withSlot(async () => {
      const dir = await mkdtemp(join(tmpdir(), "gw-"));
      try {
        const input = join(dir, `input.${ext}`);
        await writeFile(input, bytes, { mode: 0o600 });
        const r = await tool.fn(input, dir, options);
        const files = [];
        for (const f of r.files) {
          if (f.size > MAX_FILE_BYTES) throw new ToolError("The result would be larger than 25 MB. Try fewer pages or a lower quality.", 413);
          files.push(await readOutput(f));
        }
        return { files, note: r.note };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
    // Log only the tool, outcome and timing: never file names, contents or passwords.
    console.log(JSON.stringify({ tool: body.tool, ok: true, ms: Date.now() - started }));
    return send(res, 200, result);
  } catch (err) {
    const status = err instanceof ToolError ? err.status : 500;
    console.log(JSON.stringify({ tool: body.tool, ok: false, status, ms: Date.now() - started }));
    return send(res, status, { error: status === 422 ? "tool_error" : "worker_error", message: err instanceof ToolError ? err.message : "Processing failed." });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return send(res, 200, { ok: true, tools: Object.fromEntries(Object.entries(TOOLS).map(([k, t]) => [k, t.needs.every((b) => AVAILABLE[b])])) });
  }
  if (req.method === "POST" && req.url === "/v1/run") {
    handleRun(req, res).catch(() => send(res, 500, { error: "worker_error", message: "Processing failed." }));
    return;
  }
  send(res, 404, { error: "not_found", message: "Not found." });
});
server.requestTimeout = 300_000;
server.headersTimeout = 30_000;
server.listen(PORT, () => console.log(JSON.stringify({ listening: PORT, available: AVAILABLE })));

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
