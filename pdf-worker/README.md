# GeniusAI PDF worker

A small private service that runs the PDF tools that need real document software:

| Tool | Program | Notes |
|---|---|---|
| Compress PDF | Ghostscript + qpdf | Three levels; never returns a bigger file. Without Ghostscript it still does lossless optimisation. |
| Repair PDF | qpdf (Ghostscript fallback) | Rebuilds broken cross-reference tables. |
| Protect PDF | qpdf | AES-256 password. A separate random owner password is set and never shown. |
| Unlock PDF | qpdf | Needs the correct password. |
| Office to PDF | LibreOffice | Word, Excel, PowerPoint, OpenDocument, RTF, CSV, text. Macros never run. |
| PDF to JPG | poppler (pdftoppm) + zip | 72 / 150 / 300 dpi; first 50 pages; several pages come back as one ZIP. |

The web app downloads the user's file (after checking access), sends it here with a shared secret, and saves the result back to the user's Files. **The worker never touches the database or storage, and never keeps files**: every job runs in its own temporary folder that is deleted when the job ends. Logs contain only the tool name, success and timing: no file names, contents or passwords.

## API
- `GET /healthz`: which tools are available (no auth).
- `POST /v1/run` with `Authorization: Bearer <PDF_WORKER_SECRET>` and JSON `{ tool, options, file: { name, mime, base64 } }`. Returns `{ files: [{ name, mime, base64 }], note? }`, or `{ error, message }` with 4xx/5xx. Passwords travel in the JSON body, never in headers or URLs, so proxies don't log them.

## Configuration
| Variable | Required | Default | Meaning |
|---|---|---|---|
| `PDF_WORKER_SECRET` | yes | none | Random string, at least 32 characters (`openssl rand -hex 32`). The service refuses to start without it. |
| `PORT` | no | 8080 | |
| `MAX_CONCURRENT_JOBS` | no | 2 | Jobs running at once. LibreOffice and Ghostscript use 300–800 MB each. |
| `MAX_QUEUED_JOBS` | no | 8 | Extra jobs that wait; beyond this callers get a 503 "busy" message. |

Then set the same secret in the web app, plus the worker's URL:
```
PDF_WORKER_URL=https://<your-worker-host>
PDF_WORKER_SECRET=<same value>
```

## Deploy (pick one)
The image is a standard Docker image; any container host works. Recommended: **Google Cloud Run in `asia-south1` (Mumbai)**, which keeps documents in India next to your Supabase project, scales to zero when idle, and bills per second.
```
gcloud run deploy geniusai-pdf-worker --source . --region asia-south1 \
  --memory 2Gi --cpu 2 --concurrency 2 --timeout 300 --max-instances 5 \
  --set-env-vars PDF_WORKER_SECRET=<secret> --no-allow-unauthenticated   # or allow + rely on the secret
```
Alternatives: Render, Railway or Fly.io (choose a Mumbai/Singapore region, 2 GB RAM). Locally: `docker build -t geniusai-pdf-worker . && docker run -p 8080:8080 -e PDF_WORKER_SECRET=... --read-only --tmpfs /tmp:size=1g geniusai-pdf-worker`.

If you use Cloud Run's built-in authentication (`--no-allow-unauthenticated`), the web app would also need a Google identity token; the simplest setup is to allow unauthenticated invocations and rely on the shared secret, which every request must carry.

## Security checklist
- Keep the secret out of git; rotate it if it leaks (update both sides).
- Run with a read-only filesystem and a size-limited `/tmp` (as above), as the non-root user the image creates.
- The worker needs **no outbound internet access**; block egress if your host allows it.
- Rebuild the image monthly (or when Ghostscript/LibreOffice/qpdf publish security fixes): `docker build --pull`.
- Ghostscript always runs with `-dSAFER`; LibreOffice runs headless with a fresh profile per job; programs run without a shell, with timeouts and a memory-safe concurrency limit.

## Tests
`node test.mjs` starts the server and runs 23 end-to-end checks (every tool, wrong passwords, encrypted inputs, broken PDFs, auth, size limits, the busy limit, temp-folder cleanup). Needs the same programs as the worker plus `pdftotext` and `unzip` (both in poppler-utils/unzip). Inside the image: `docker run --rm -v "$PWD/test.mjs:/app/test.mjs:ro" --tmpfs /tmp:size=1g geniusai-pdf-worker node test.mjs` (test.mjs is mounted because `.dockerignore` keeps it out of the image).
