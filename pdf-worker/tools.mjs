// GeniusAI PDF worker: the tools. Each takes an input file path and returns
// output files. All heavy lifting is done by well-known command-line programs:
//   qpdf (encryption, repair, lossless optimisation), Ghostscript (image compression),
//   LibreOffice (Office → PDF), poppler's pdftoppm (PDF → JPG), zip.
// Programs are run with execFile (no shell), a per-job temp folder, a timeout and
// a minimal environment. Ghostscript always runs with -dSAFER.

import { execFile } from "node:child_process";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export class ToolError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = "ToolError";
    this.status = status;
  }
}

const PATH = process.env.PATH || "/usr/local/bin:/usr/bin:/bin";

function which(bin) {
  return PATH.split(":").some((dir) => existsSync(join(dir, bin)));
}

export const AVAILABLE = {
  qpdf: which("qpdf"),
  gs: which("gs"),
  soffice: which("soffice"),
  pdftoppm: which("pdftoppm"),
  zip: which("zip")
};

/** Runs a program without a shell. Resolves with { code, stdout, stderr }; never throws for exit codes. */
export function run(cmd, args, { cwd, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024, env: { PATH, HOME: cwd, LANG: "C.UTF-8", TMPDIR: cwd } },
      (err, stdout, stderr) => {
        if (err && err.killed) return reject(new ToolError("This file took too long to process.", 504));
        if (err && typeof err.code !== "number") return reject(new ToolError(`${cmd} is not available on this worker.`, 503));
        resolve({ code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

// qpdf: 0 = ok, 3 = ok with warnings, 2 = error.
const qpdfOk = (r) => r.code === 0 || r.code === 3;

async function isEncrypted(input, cwd) {
  const r = await run("qpdf", ["--is-encrypted", input], { cwd, timeoutMs: 20_000 });
  return r.code === 0; // 0 = encrypted, 2 = not encrypted
}

async function requiresPassword(input, cwd) {
  const r = await run("qpdf", ["--requires-password", input], { cwd, timeoutMs: 20_000 });
  return r.code === 0; // 0 = needs a password to open, 2 = not encrypted, 3 = encrypted but opens without one
}

async function pageCount(input, cwd) {
  const r = await run("qpdf", ["--show-npages", input], { cwd, timeoutMs: 20_000 });
  if (r.code !== 0) throw new ToolError("This file couldn't be read as a PDF. Try Repair PDF first.");
  return Number.parseInt(r.stdout.trim(), 10);
}

/** Writes qpdf arguments to a private file so passwords never appear in the process list. */
async function argsFile(cwd, args) {
  const path = join(cwd, `args-${randomBytes(6).toString("hex")}`);
  await writeFile(path, args.join("\n") + "\n", { mode: 0o600 });
  return `@${path}`;
}

function validatePassword(pw, { allowEmpty = false } = {}) {
  if (typeof pw !== "string") throw new ToolError("Enter a password.");
  if (!allowEmpty && pw.length < 6) throw new ToolError("Use a password of at least 6 characters.");
  if (pw.length > 128) throw new ToolError("Passwords can be up to 128 characters.");
  if (/[\u0000-\u001f\u007f]/.test(pw)) throw new ToolError("The password contains characters that can't be used.");
  return pw;
}

async function out(path, name, mime) {
  return { path, name, mime, size: (await stat(path)).size };
}

// ---------------------------------------------------------------------------

const GS_PRESET = { low: "/printer", recommended: "/ebook", extreme: "/screen" };

export async function compress(input, dir, opts) {
  if (await requiresPassword(input, dir)) throw new ToolError("This PDF is password-protected. Unlock it first, then compress.");
  const level = Object.hasOwn(GS_PRESET, opts.level) ? opts.level : "recommended";
  let source = input;
  let usedGhostscript = false;

  if (AVAILABLE.gs) {
    const gsOut = join(dir, "gs.pdf");
    const r = await run("gs", [
      "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET",
      "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", `-dPDFSETTINGS=${GS_PRESET[level]}`,
      "-dDetectDuplicateImages=true", "-dCompressFonts=true", "-dSubsetFonts=true",
      `-sOutputFile=${gsOut}`, input
    ], { cwd: dir, timeoutMs: 180_000 });
    if (r.code === 0 && existsSync(gsOut)) {
      source = gsOut;
      usedGhostscript = true;
    }
  }

  // Lossless pass: recompress streams and pack objects.
  const final = join(dir, "compressed.pdf");
  const q = await run("qpdf", ["--object-streams=generate", "--compress-streams=y", "--recompress-flate", "--compression-level=9", source, final], { cwd: dir, timeoutMs: 120_000 });
  if (!qpdfOk(q)) throw new ToolError("This PDF couldn't be compressed. Try Repair PDF first.");

  const before = (await stat(input)).size;
  const after = (await stat(final)).size;
  if (after >= before) {
    return { files: [await out(input, "compressed", "application/pdf")], note: "This PDF is already well optimised, so the size didn't change." };
  }
  const saved = Math.round((1 - after / before) * 100);
  const how = usedGhostscript ? "" : " (lossless only: image compression needs Ghostscript on the worker)";
  return { files: [await out(final, "compressed", "application/pdf")], note: `${saved}% smaller${how}.` };
}

export async function repair(input, dir) {
  if (await requiresPassword(input, dir)) throw new ToolError("This PDF is password-protected. Unlock it first.");
  const final = join(dir, "repaired.pdf");
  const q = await run("qpdf", ["--object-streams=generate", input, final], { cwd: dir, timeoutMs: 120_000 });
  if (qpdfOk(q) && existsSync(final)) return { files: [await out(final, "repaired", "application/pdf")] };
  if (AVAILABLE.gs) {
    const r = await run("gs", ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-sDEVICE=pdfwrite", `-sOutputFile=${final}`, input], { cwd: dir, timeoutMs: 180_000 });
    if (r.code === 0 && existsSync(final)) return { files: [await out(final, "repaired", "application/pdf")], note: "Rebuilt from what could be recovered." };
  }
  throw new ToolError("This PDF is too damaged to repair.");
}

export async function protect(input, dir, opts) {
  const password = validatePassword(opts.password);
  if (await isEncrypted(input, dir)) throw new ToolError("This PDF is already password-protected.");
  const owner = randomBytes(24).toString("base64url"); // separate owner password; never shown
  const final = join(dir, "protected.pdf");
  // Named forms (--user-password=...) so a password like "--decrypt" is always treated as text.
  const args = await argsFile(dir, ["--encrypt", `--user-password=${password}`, `--owner-password=${owner}`, "--bits=256", "--", input, final]);
  const q = await run("qpdf", [args], { cwd: dir, timeoutMs: 120_000 });
  if (!qpdfOk(q)) throw new ToolError("This PDF couldn't be protected. Try Repair PDF first.");
  return { files: [await out(final, "protected", "application/pdf")], note: "Protected with AES-256. Keep the password safe: it can't be recovered." };
}

export async function unlock(input, dir, opts) {
  const password = validatePassword(opts.password ?? "", { allowEmpty: true });
  if (!(await isEncrypted(input, dir))) throw new ToolError("This PDF isn't password-protected.");
  const final = join(dir, "unlocked.pdf");
  const args = await argsFile(dir, [`--password=${password}`, "--decrypt", input, final]);
  const q = await run("qpdf", [args], { cwd: dir, timeoutMs: 120_000 });
  if (!qpdfOk(q)) {
    if (/password/i.test(q.stderr)) throw new ToolError(password ? "That password is incorrect." : "This PDF needs its password to unlock.");
    throw new ToolError("This PDF couldn't be unlocked.");
  }
  return { files: [await out(final, "unlocked", "application/pdf")] };
}

export const OFFICE_EXT = {
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/rtf": "rtf",
  "text/csv": "csv",
  "text/plain": "txt"
};

export async function officeToPdf(input, dir) {
  const outDir = join(dir, "out");
  await mkdir(outDir);
  // Own LibreOffice profile per job; headless conversion never runs document macros.
  const r = await run("soffice", [
    `-env:UserInstallation=file://${join(dir, "lo-profile")}`,
    "--headless", "--norestore", "--nolockcheck", "--nodefault", "--nologo",
    "--convert-to", "pdf", "--outdir", outDir, input
  ], { cwd: dir, timeoutMs: 150_000 });
  const pdf = (await readdir(outDir)).find((f) => f.toLowerCase().endsWith(".pdf"));
  if (r.code !== 0 || !pdf) throw new ToolError("This file couldn't be converted. It may be damaged or password-protected.");
  return { files: [await out(join(outDir, pdf), "converted", "application/pdf")] };
}

const JPG_DPI = { small: 72, standard: 150, high: 300 };
export const MAX_JPG_PAGES = 50;

export async function pdfToJpg(input, dir, opts) {
  if (await requiresPassword(input, dir)) throw new ToolError("This PDF is password-protected. Unlock it first.");
  const pages = await pageCount(input, dir);
  const dpi = JPG_DPI[opts.quality] ?? JPG_DPI.standard;
  const outDir = join(dir, "pages");
  await mkdir(outDir);
  const last = Math.min(pages, MAX_JPG_PAGES);
  const r = await run("pdftoppm", ["-jpeg", "-jpegopt", "quality=85", "-r", String(dpi), "-f", "1", "-l", String(last), input, join(outDir, "page")], { cwd: dir, timeoutMs: 180_000 });
  const images = (await readdir(outDir)).filter((f) => f.endsWith(".jpg")).sort();
  if (r.code !== 0 || images.length === 0) throw new ToolError("This PDF couldn't be turned into images.");
  const note = pages > MAX_JPG_PAGES ? `Only the first ${MAX_JPG_PAGES} of ${pages} pages were converted.` : undefined;
  if (images.length === 1) return { files: [await out(join(outDir, images[0]), "page 1", "image/jpeg")], note };
  const zipPath = join(dir, "pages.zip");
  const z = await run("zip", ["-j", "-q", "-X", zipPath, ...images.map((f) => join(outDir, f))], { cwd: dir, timeoutMs: 60_000 });
  if (z.code !== 0) throw new ToolError("The images couldn't be packed into a ZIP file.", 500);
  return { files: [await out(zipPath, `${images.length} images`, "application/zip")], note };
}

export const TOOLS = {
  compress: { needs: ["qpdf"], input: "pdf", fn: compress },
  repair: { needs: ["qpdf"], input: "pdf", fn: repair },
  protect: { needs: ["qpdf"], input: "pdf", fn: protect },
  unlock: { needs: ["qpdf"], input: "pdf", fn: unlock },
  "office-to-pdf": { needs: ["soffice"], input: "office", fn: officeToPdf },
  "pdf-to-jpg": { needs: ["qpdf", "pdftoppm", "zip"], input: "pdf", fn: pdfToJpg }
};

export async function readOutput(file) {
  return { name: file.name, mime: file.mime, base64: (await readFile(file.path)).toString("base64") };
}
