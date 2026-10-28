# Implementation status

## Completed
- Separate Supabase project created: `GeniusAI Workspace`
- Project reference: `wxvaahhlywaklpfuocak`
- Region: Mumbai (`ap-south-1`)
- Core database migration applied and verified: 12 public tables, RLS enabled on each.
- Starter plan row inserted in `plan_catalog`.
- Existing `Playbook` project was not modified.
- Follow-up migration `202610220002` written and tested locally (23/23 RLS checks pass). **Needs to be applied to the Supabase project.**
- Environment variable name unified (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, legacy `..._ANON_KEY` still accepted).
- Private storage migration `202610220003` written and tested locally (14/14 storage checks pass). **Needs to be applied after `202610220002`.**
- Sign-up/onboarding migration `202610220004` written and tested locally (15/15 checks). **Apply after `202610220003`.**
- Email-link sign-in, onboarding page, session middleware, sign-out, and a dashboard wired to real data (workspace, credits, recent files with upload/download/delete).
- AI jobs + credits migration `202610230005` written and tested locally (26/26 checks). **Apply after `202610220004`.**
- Document Genius (summarize / translate / extract text) built: API route, Claude client, tool page, result history. Claude client and document handling unit-tested against a mocked API (18 checks); not yet run against the live API.
- Workspace experience Phase 1 (see `docs/PRODUCT_SPEC.md`): themes & accents, Settings, Files library, responsive navigation, security headers. Migration `202610230006` tested locally (11/11 checks). **Apply after `202610230005`.**
- PDF Toolkit (9 instant tools) and two new Document Genius tasks (PDF→Markdown, tables→CSV). PDF engine tested on real PDFs (22 checks, outputs rendered and inspected); CSV safety tested (8 checks). No new migration.
- PDF worker service (`/pdf-worker`): 6 tools, 23 end-to-end checks against real qpdf/LibreOffice/poppler; app↔worker client tested (6 checks). Ghostscript image compression and the Docker image itself could not be run in the build environment (lossless compression path tested instead). Migration `202610230007` (file types) tested. **Deploy the worker and set PDF_WORKER_URL / PDF_WORKER_SECRET.**
- Payments (Razorpay credit packs): migration `202610230008` tested (19 checks); Razorpay client tested with independently computed signatures (15 checks); webhook logic tested (10 checks). Not yet run against Razorpay's real API (needs your keys). **Apply migration, add keys + webhook, test in Razorpay test mode.**
- Public Pricing, Terms, Privacy, Refunds and Contact pages (drafts; fill in `src/lib/site.ts` and get legal review). Refund function (migration `202610230009`, 9 checks).
- Agreement Studio (revision 11): migration `202610230010` (15 checks), credited-task helper (14 checks), templates/prompts/Markdown/Word export (13 checks, Word output rendered in LibreOffice), pages server-rendered and screenshotted at phone/tablet/desktop widths. Not yet run against the live Claude API. **Apply the migration and run `npm install` (adds `docx`).**
- App-side upload/download/delete helpers in `src/lib/storage/files.ts`.
- ESLint 9 flat config added so `npm run lint` works.
- Dashboard text sizes raised for readability; placeholder upload button is now visibly disabled.
- Conflict Finder (revision 25): compare 2 to 5 documents for cross-document conflicts. Report parser tested (21 checks); page layout rendered at phone and desktop widths. Not yet run against the live Claude API. No migration.
- New-law impact check (revision 26): one new rule against up to 5 contracts, with suggested amendment wording. Report checker tested (22 checks); layout rendered at phone width. Not yet run against the live Claude API. No migration.
- Chat with several documents (revision 27): up to 5 files per question; single-file chat unchanged (prompt verified identical). Not yet run against the live Claude API. No migration.
- Live database checked on 28 Oct 2026: every migration through 202610250022 is in place; 202610240014 (indexes) was missing and has now been applied.

## Not yet complete
- Phase 2 and 3 of `docs/PRODUCT_SPEC.md` (billing, command palette & full-text search, folders/trash, preview, sharing, notifications, 2FA, PDF tools, signing, templates, integrations, PWA).
- GitHub repository creation (the connected GitHub actions do not expose repository creation).
- Custom SMTP for sign-in emails (Supabase's built-in sender is for testing only).
- Workspace switcher and settings page (rename workspace, edit profile).
- Server-side virus/malware scanning that sets `files.scan_status` (and removes quarantined objects).
- Member invitation flow (server-side).
- The roadmap in `docs/PRODUCT_SPEC.md` §11: e-signatures, fillable forms, PDF text editing, collaboration, developer API, Drive import and the remaining PDF tools.
- Subscriptions and GST invoices; a background queue for very long jobs.
- Production hardening and a security review.

Do not commit real API keys. Keep server-only secrets in deployment environment variables and never expose the Supabase service-role key in browser code.
