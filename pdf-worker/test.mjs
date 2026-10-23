// End-to-end tests for the PDF worker. Needs the same programs as the worker
// (qpdf, LibreOffice, pdftoppm, zip; Ghostscript optional) plus pdftotext/unzip.
// Run:  node test.mjs
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SECRET = "test-secret-" + "x".repeat(40);
const PORT = 18000 + Math.floor(Math.random() * 1000);
const work = mkdtempSync(join(tmpdir(), "gwtest-"));
let passed = 0;
const ok = (m) => { passed++; console.log("PASS", m); };

/** A small but valid PDF with uncompressed text pages (easy to compress). */
function makePdf(pages, { corruptXref = false } = {}) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const parentId = pages * 2 + 2;
  for (let i = 1; i <= pages; i++) {
    const lines = Array.from({ length: 40 }, (_, k) => `BT /F1 10 Tf 40 ${780 - k * 18} Td (Page ${i} line ${k} lorem ipsum dolor sit amet repeated text) Tj ET`).join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(lines)} >>\nstream\n${lines}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${parentId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${pages} >>`);
  assert.equal(pagesId, parentId);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let body = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(corruptXref ? o + 7 : o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${corruptXref ? xrefAt + 50 : xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function call(tool, file, options = {}, { auth = SECRET, raw } = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: raw ?? JSON.stringify({ tool, options, file: { name: file.name, mime: file.mime, base64: file.bytes.toString("base64") } })
  });
  return { status: res.status, body: await res.json() };
}
const pdfFile = (bytes, name = "doc.pdf") => ({ name, mime: "application/pdf", bytes });
const save = (name, b64) => { const p = join(work, name); writeFileSync(p, Buffer.from(b64, "base64")); return p; };
const qpdfCode = (args) => { try { execFileSync("qpdf", args, { stdio: "pipe" }); return 0; } catch (e) { return e.status; } };
const gwDirs = () => readdirSync(tmpdir()).filter((d) => d.startsWith("gw-")).length;

function startServer(env = {}) {
  const child = spawn(process.execPath, [new URL("./server.mjs", import.meta.url).pathname], { env: { ...process.env, PDF_WORKER_SECRET: SECRET, PORT: String(PORT), ...env }, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    child.stdout.once("data", () => resolve(child));
    child.once("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
}

const server = await startServer();
try {
  const dirsBefore = gwDirs();

  // --- service basics
  const health = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json();
  assert.equal(health.ok, true); assert.equal(health.tools.protect, true); ok(`healthz lists tools ${JSON.stringify(health.tools)}`);
  const three = makePdf(3);
  assert.equal((await call("compress", pdfFile(three), {}, { auth: null })).status, 401);
  assert.equal((await call("compress", pdfFile(three), {}, { auth: "wrong-secret" })).status, 401); ok("requests without the right secret are rejected (401)");
  assert.equal((await call("nope", pdfFile(three))).status, 400); ok("unknown tool -> 400");
  const notPdf = await call("compress", pdfFile(Buffer.from("hello, not a pdf")));
  assert.equal(notPdf.status, 422); assert.match(notPdf.body.message, /isn't a PDF/); ok("non-PDF input -> 422 with message");
  const huge = await call("compress", null, {}, { raw: JSON.stringify({ tool: "compress", file: { base64: "A".repeat(36 * 1024 * 1024) } }) }).catch(() => ({ status: 413 }));
  assert.equal(huge.status, 413); ok("oversized upload -> 413");

  // --- compress
  const comp = await call("compress", pdfFile(three), { level: "recommended" });
  assert.equal(comp.status, 200, JSON.stringify(comp.body));
  const compPath = save("c.pdf", comp.body.files[0].base64);
  assert.ok(readFileSync(compPath).length < three.length, "smaller"); assert.equal(qpdfCode(["--check", compPath]), 0);
  assert.match(execFileSync("pdftotext", [compPath, "-"]).toString(), /Page 3 line 0/); ok(`compress: smaller and still valid/readable (${comp.body.note})`);

  // --- repair
  const broken = makePdf(2, { corruptXref: true });
  assert.notEqual(qpdfCode(["--check", save("broken.pdf", broken.toString("base64"))]), 0);
  const rep = await call("repair", pdfFile(broken));
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  const repPath = save("r.pdf", rep.body.files[0].base64);
  assert.equal(qpdfCode(["--check", repPath]), 0); assert.match(execFileSync("pdftotext", [repPath, "-"]).toString(), /Page 2 line 39/); ok("repair: PDF with a broken cross-reference table is fixed, text intact");

  // --- protect / unlock
  const prot = await call("protect", pdfFile(three), { password: "s3cret-pass" });
  assert.equal(prot.status, 200, JSON.stringify(prot.body));
  const protPath = save("p.pdf", prot.body.files[0].base64);
  assert.equal(qpdfCode(["--requires-password", protPath]), 0);
  assert.match(execFileSync("qpdf", ["--password=s3cret-pass", "--show-encryption", protPath]).toString(), /AESv3|256/); ok("protect: needs a password to open, AES-256");
  assert.equal((await call("protect", pdfFile(readFileSync(protPath)), { password: "another-pass" })).body.message, "This PDF is already password-protected."); ok("protect refuses an already-protected PDF");
  assert.match((await call("protect", pdfFile(three), { password: "123" })).body.message, /at least 6/); ok("protect refuses short passwords");
  assert.match((await call("protect", pdfFile(three), { password: "bad\npass" })).body.message, /can't be used/); ok("protect refuses control characters");
  const wrong = await call("unlock", pdfFile(readFileSync(protPath)), { password: "not-it" });
  assert.equal(wrong.status, 422); assert.equal(wrong.body.message, "That password is incorrect."); ok("unlock: wrong password -> clear message");
  const unl = await call("unlock", pdfFile(readFileSync(protPath)), { password: "s3cret-pass" });
  assert.equal(unl.status, 200); const unlPath = save("u.pdf", unl.body.files[0].base64);
  assert.equal(qpdfCode(["--is-encrypted", unlPath]), 2); ok("unlock: correct password removes encryption");
  assert.match((await call("unlock", pdfFile(three), { password: "x" })).body.message, /isn't password-protected/); ok("unlock refuses an unprotected PDF");
  const dash = await call("protect", pdfFile(three), { password: "--decrypt -x @y" });
  assert.equal(dash.status, 200); const dashPath = save("d.pdf", dash.body.files[0].base64);
  assert.equal((await call("unlock", pdfFile(readFileSync(dashPath)), { password: "--decrypt -x @y" })).status, 200); ok("passwords that look like options are treated as plain text");
  assert.match((await call("compress", pdfFile(readFileSync(protPath)))).body.message, /Unlock it first/); ok("compress asks to unlock protected PDFs first");

  // --- PDF to JPG
  const one = await call("pdf-to-jpg", pdfFile(makePdf(1)), { quality: "small" });
  assert.equal(one.status, 200); assert.equal(one.body.files[0].mime, "image/jpeg");
  assert.deepEqual([...Buffer.from(one.body.files[0].base64, "base64").subarray(0, 2)], [0xff, 0xd8]); ok("pdf-to-jpg: 1 page -> one JPEG");
  const many = await call("pdf-to-jpg", pdfFile(three), { quality: "small" });
  assert.equal(many.body.files[0].mime, "application/zip");
  const zipPath = save("pages.zip", many.body.files[0].base64);
  assert.equal((execFileSync("unzip", ["-Z1", zipPath]).toString().trim().split("\n")).length, 3); ok("pdf-to-jpg: 3 pages -> ZIP with 3 JPEGs");

  // --- Office to PDF
  const csv = await call("office-to-pdf", { name: "sales.csv", mime: "text/csv", bytes: Buffer.from("Item,Amount\nRent,85000\nTea,1200\n") });
  assert.equal(csv.status, 200, JSON.stringify(csv.body));
  assert.match(execFileSync("pdftotext", [save("csv.pdf", csv.body.files[0].base64), "-"]).toString(), /Rent[\s\S]*85000/); ok("office-to-pdf: CSV spreadsheet -> PDF");
  writeFileSync(join(work, "note.txt"), "Quarterly report\nनमस्ते — Hindi text should survive.\n");
  execFileSync("soffice", [`-env:UserInstallation=file://${join(work, "lo")}`, "--headless", "--convert-to", "docx", "--outdir", work, join(work, "note.txt")], { stdio: "pipe" });
  const docx = await call("office-to-pdf", { name: "note.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: readFileSync(join(work, "note.docx")) });
  assert.equal(docx.status, 200, JSON.stringify(docx.body));
  const docxText = execFileSync("pdftotext", [save("docx.pdf", docx.body.files[0].base64), "-"]).toString();
  assert.match(docxText, /Quarterly report/); ok(`office-to-pdf: Word .docx -> PDF${/नमस्ते/.test(docxText) ? " (Hindi text kept)" : " (Hindi needs Noto fonts: included in the Docker image)"}`);
  assert.match((await call("office-to-pdf", { name: "x.exe", mime: "application/x-msdownload", bytes: Buffer.from("MZ") })).body.message, /can't be converted/); ok("office-to-pdf refuses other file types");

  assert.equal(gwDirs(), dirsBefore); ok("every job's temporary folder was deleted");
} finally {
  server.kill();
}

// --- queue limit: one slot, no waiting room -> second simultaneous job gets 503
const busy = await startServer({ MAX_CONCURRENT_JOBS: "1", MAX_QUEUED_JOBS: "0" });
try {
  const csvFile = { name: "a.csv", mime: "text/csv", bytes: Buffer.from("a,b\n1,2\n") };
  const results = await Promise.all([call("office-to-pdf", csvFile), call("office-to-pdf", csvFile)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 503]); ok("when busy, extra jobs get a clear 503 instead of overloading the server");
} finally {
  busy.kill();
  rmSync(work, { recursive: true, force: true });
}
console.log(`\n${passed} checks passed`);
