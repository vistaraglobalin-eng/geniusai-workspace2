# GeniusAI Workspace

Responsive Next.js + TypeScript starter for five AI productivity modules:
1. AI Document Genius
2. AI Resume & Job Application Studio
3. Product Photo & Ad Maker
4. AI Invoice & Receipt Manager
5. Contract & Agreement Explainer

## Supabase development project
- Project: `GeniusAI Workspace`
- Project reference: `wxvaahhlywaklpfuocak`
- Region: Mumbai (`ap-south-1`)
- API URL: `https://wxvaahhlywaklpfuocak.supabase.co`

The core database migration has already been applied to this new project. The migration file is included here for version control. Do not apply it again to a database that already has these tables unless you first reconcile migration history. The existing `Playbook` project was not changed.

## Run locally
1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` to the API URL above.
4. Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project’s publishable (or legacy anon) key from Supabase Project Settings → API Keys. Never put a service-role key in a `NEXT_PUBLIC_` variable.
5. For AI tools, also set the server-only `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` (see `.env.example`).
6. Run `npm install`, then `npm run dev`.
7. Open `/api/health` and confirm `supabaseConfigured` is `true`.

## Scope and status
Working today: email sign-in, workspace onboarding, private file upload/download/delete, a dashboard showing the user's workspace, files and credits, the first AI tool, **Document Genius** (summarize, translate, extract text, PDF to Markdown, tables to CSV), **credit packs paid with Razorpay** (UPI, cards, netbanking), a **PDF Toolkit** with 15 tools (merge, split, remove/extract/reorder pages, rotate, page numbers, watermark, JPG/PNG to PDF in the app; compress, repair, protect, unlock, Office to PDF and PDF to JPG via the separate **PDF worker**), a **Files** library with search and filters, **Settings** (profile, workspace, appearance, privacy & security), light/dark themes with six accent colours, and navigation that adapts to desktop, tablet and phone. The full feature plan is in `docs/PRODUCT_SPEC.md`. Not yet built: the other four AI tools, malware scanning, subscriptions/GST invoices, team invitations, a workspace switcher/settings page, mobile app packaging and production security review.

## Sign-in setup (one time, in the Supabase dashboard)
Sign-in uses passwordless email links. New users get an account the first time they request a link.
1. **Authentication → URL Configuration**
   - *Site URL*: `http://localhost:3000` while developing (change to your live domain at launch).
   - *Redirect URLs*: add `http://localhost:3000/auth/callback` and, later, `https://<your-domain>/auth/callback`.
2. **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
3. **Email sending**: Supabase's built-in email service only sends a few emails per hour and is meant for testing. Before real users arrive, add your own SMTP provider under **Authentication → Emails → SMTP Settings** (for example Resend, Postmark or Amazon SES).
4. Links must be opened in the same browser they were requested from, and expire after an hour. The login page explains this if a link fails.

### How the app flows
- `/login` → email link → `/auth/callback` → `/onboarding` (first time: name, personal/business, workspace name, currency) → `/` dashboard.
- `src/middleware.ts` keeps the session fresh and sends signed-out visitors to `/login` (only `/login`, `/auth/*` and `/api/health` are public).
- Sign out is a POST to `/auth/signout` (button at the bottom of the sidebar).
- The dashboard uses the user's first workspace. A workspace switcher is a later step.

## Database migrations
**Status (23 Oct 2026):** migrations 2–10 plus 4b have been applied to the GeniusAI Workspace project using `supabase/GeniusAI_database_setup.sql` (all of them in one transaction) and verified: 17 tables, row-level security on all, only the app's storage rules.

1. `202610220001_geniusai_core_schema.sql` — core schema and RLS policies. **Already applied** to the project; do not run it again.
2. `202610220002_security_and_onboarding_fixes.sql` — **not yet applied; apply this next** (Supabase SQL editor, or `supabase db push` once migration history is linked). It:
   - adds the owner as a member automatically when a workspace is created (plus a zero-balance credit account and an audit entry), and backfills any existing workspaces;
   - limits clients to safe file columns: they can no longer set `scan_status`, move a file to another workspace or change its uploader, and storage keys must start with `<workspace_id>/`;
   - lets only the uploader or a workspace owner/admin edit a file record;
   - stops clients changing a workspace's owner; caps users at 10 owned workspaces;
   - keeps `updated_at` current, adds `module_key` checks, and lets signed-out visitors read active plans.

3. `202610220003_private_storage.sql` — **apply after #2.** Creates the private `private-user-files` bucket (25 MB limit; PDF, Word, Excel, CSV, text and common image types) and its access rules.
4. `202610220004_auth_onboarding.sql` — **apply after #3.** Creates a profile for every new user and adds `complete_onboarding()`, which saves the user's name and creates their first workspace in one step (safe to call twice). Also stops signed-out visitors calling internal helper functions.
5. `202610230005_ai_jobs_and_credits.sql` — **apply after #4.** Job results, welcome credits (200 per workspace, including existing ones), and server-only functions that reserve, charge and refund credits.
6. `202610230006_preferences_and_profile_hardening.sql` — **apply after #5.** Adds `profiles.preferences` (theme, accent, text size, motion) with validation, and limits which profile fields users can edit.
7. `202610230007_more_file_types.sql` — **apply after #6.** Lets the private bucket accept PowerPoint, OpenDocument, RTF and ZIP files (for Office to PDF and PDF to JPG).
8. `202610230008_payments.sql` — **apply after #7.** Credit packs, payment orders and once-only fulfilment (see Payments).
9. `202610230009_refunds.sql` — **apply after #8.** Adds `process_refund()` for unused packs (see Public pages & policies).
   - `202610220004b_remove_earlier_setup.sql`: **apply after #4.** Removes storage rules and a sign-up trigger that were added to the live project before these migrations (safe on a fresh database).
10. `202610230010_agreements.sql` — **apply after #9.** Agreement Studio: `agreements` and `agreement_versions`, with automatic version history (see Agreement Studio).

## Payments (Razorpay)
Page: `/billing` (sidebar → Plans & credits). One-time **credit packs**, no subscriptions or auto-renewal; credits never expire. Seeded packs (**placeholder prices, GST inclusive: change them before launch**): Starter 500 credits ₹199 · Standard 2,000 ₹699 · Pro 6,000 ₹1,799. Edit in SQL: `update public.credit_packs set price_minor = 24900 where pack_key = 'starter';` (paise).

How a purchase works:
1. `POST /api/billing/checkout`: owner/admin only; the price is read from `credit_packs` (never from the browser); creates a Razorpay order and records it in `payment_orders`.
2. Razorpay Checkout opens (loaded only when someone clicks Buy).
3. `POST /api/billing/verify`: checks Razorpay's signature for **our** order id, then asks Razorpay that the payment is **captured**, for this order and the exact amount, then calls `fulfil_payment()`.
4. `POST /api/billing/webhook` (`payment.captured`, `order.paid`, `payment.failed`) does the same independently, so a closed tab never loses a purchase. Duplicate deliveries are ignored.
`fulfil_payment()` grants credits **exactly once** per order (tested: callback + webhook + retries add credits once; wrong amount/currency or fake orders are refused).

Setup:
1. Razorpay Dashboard → **API Keys** → generate *test* keys. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (server-only).
2. Dashboard → **Payment capture** → *Automatic* (otherwise payments stay "authorized" and are refunded).
3. Dashboard → **Webhooks** → Add `https://<your-domain>/api/billing/webhook`, events `payment.captured`, `payment.failed`, `order.paid`, choose a secret → set `RAZORPAY_WEBHOOK_SECRET`.
4. Apply migration `202610230008_payments.sql`.
5. Test with Razorpay's test cards/UPI (e.g. UPI ID `success@razorpay`), then switch to live keys after Razorpay activates your account.

Before going live (business/legal; confirm with your CA/lawyer, this isn't advice): Razorpay activation needs Terms, Privacy, Refund/Cancellation and Contact pages on your site; decide your GST position (the page says "Prices include GST": only true if you're registered and pricing that way) and how you'll issue GST invoices; publish a refund policy for unused credits.

## Public pages & policies
Public (no sign-in): `/pricing` (reads `credit_packs`, cached 5 min), `/terms`, `/privacy`, `/refunds`, `/contact`. Linked from the sign-in page (with a consent line), Billing ("By buying you agree…"), Settings → Privacy & security, and every public page's footer.

1. **Fill in `src/lib/site.ts`**: legal business name, business type, address, support email/phone, Grievance Officer, GSTIN (when registered), court city, and the names of your hosting, email and PDF-worker providers. Anything still in `[brackets]` shows **highlighted in yellow** on the pages.
2. **Have a lawyer review the policies.** They're drafted to match what the app actually does (Supabase in Mumbai, Anthropic for AI tasks only, Razorpay, the PDF worker, essential cookies only, DPDP Act rights), but they are drafts, not legal advice.
3. The refund policy promises a full refund within 7 days for **unused** packs (`refundWindowDays` in `site.ts`). To refund: refund the payment in the Razorpay Dashboard, then run `select public.process_refund('order_XXXX', 'reason');` in the Supabase SQL editor. It removes the pack's credits and marks the order refunded, and refuses if the credits were already used (migration `202610230009_refunds.sql`).

## Workspace experience (Phase 1 of docs/PRODUCT_SPEC.md)
- **Navigation:** full sidebar on desktop, icon rail on tablets (761–1099px), bottom tab bar on phones (≤760px). Skip-to-content link, `aria-current` on the active page.
- **Appearance** (Settings → Appearance): Light / Dark / Match device; accents Lavender (brand default), Ocean, Emerald, Sunset, Rose, Graphite; Default/Large text; Motion. All colours come from tokens in `globals.css`; every pairing meets WCAG AA contrast. Saved in a cookie (so pages render in the right theme with no flash) and in the user's profile (so it follows them to other devices).
- **Files** (`/files`): search by name, filter by type, sort, "Load more", drag-and-drop upload, open a file straight in Document Genius. Search, filter and sort live in the URL.
- **Settings** (`/settings`): profile name; workspace name/type/currency (owner only); appearance; sign out of all devices; download my data (JSON).
- **Sign out** in the sidebar now signs out of this device only (Supabase's default signs out everywhere).
- **Security headers** on every response (no sniffing, no framing, strict referrer, locked-down permissions, HSTS).

## PDF Toolkit
Page: `/tools/pdf` (hub) and `/tools/pdf/<tool>`. Nine instant tools, free (no credits), built on `pdf-lib` so they run on any Node host with no extra servers:
merge · split (by ranges or every N pages) · remove pages · extract pages · reorder · rotate (all or some pages) · page numbers (4 positions, 3 styles, skip cover) · text watermark · JPG/PNG to PDF (A4 or image-sized; phone photos are turned upright using their EXIF orientation).
- `src/lib/pdf/tools.ts` does the work (bytes in, bytes out); `src/app/api/pdf/run/route.ts` checks access, downloads the inputs, runs the tool and saves results to Files as **new** files (originals untouched; all-or-nothing if saving fails).
- Limits: 20 files / 60 MB per run, 2,000 pages, 50 parts per split, results up to 25 MB.
- Page ranges accept `1-3, 5, 8-` (8- = to the end) with clear messages for mistakes.
- Watermark text is limited to Latin characters for now (standard PDF fonts); Hindi and other scripts need an embedded font (planned).
- The AI tools (summarize, translate, OCR, PDF to Markdown, tables to Excel) are linked from the toolkit and run in Document Genius.
- **Worker tools** (`/pdf-worker`, a separate small service; see its README to deploy): Compress (3 levels), Repair, Protect (AES-256 password), Unlock, Office to PDF (Word/Excel/PowerPoint/OpenDocument/RTF/CSV/text), PDF to JPG (one JPG, or a ZIP for several pages). The app sends the file with a shared secret and saves the result to Files. Until `PDF_WORKER_URL` and `PDF_WORKER_SECRET` are set, these tools show "Setup needed" and explain why instead of failing.
- Not yet: sign, redact, compare, PDF to Word/PowerPoint.

## Document Genius (tool 01)
Page: `/tools/documents`. Pick an uploaded document (PDF, Word .docx, text, CSV, PNG/JPEG/WebP photo) and choose **Summarize**, **Translate** (25 languages, including 10 Indian languages), **Extract text** (OCR), **PDF to Markdown** (.md download) or **Extract tables** (.csv download that opens in Excel; formula-like cells are neutralised to prevent spreadsheet formula injection). Results can be copied or downloaded as .txt, and past results stay in "Recent results".

How a run works (`src/app/api/documents/run/route.ts`):
1. Checks the user can see the file (row-level security), and that it isn't blocked.
2. Counts the exact input tokens with Claude's free token-counting endpoint.
3. Reserves the most the task could cost; refuses if the workspace can't cover it.
4. Runs the task with Claude (`claude-sonnet-5-5` by default; change with `AI_MODEL`).
5. Charges what was actually used and returns the rest. Any failure refunds everything. A retried request returns the first result instead of charging again.

**Credits:** 1 credit = 1,000 input tokens (about 750 words); output tokens count 5× because they cost 5× more. On Sonnet 5.5 that's about $0.002 of provider cost per credit, so set your plan prices with your margin on top. A typical 10-page summary uses roughly 20–40 credits. New workspaces get 200 welcome credits; change that with
`update public.app_settings set value = '500' where key = 'welcome_credits';`

**Limits:** PDFs up to 23 MB, images up to 5 MB, documents up to ~300k tokens. Summaries can be up to ~2,000 tokens; translations and extractions up to 16,000 tokens (longer outputs are cut off and the page says so).

**Hosting:** long translations can take a couple of minutes. The route allows 300 seconds (`maxDuration`); make sure your host permits that (Vercel does on current plans).

**Privacy:** the document is sent to Anthropic only when a user runs a task on it. Review the provider's data-use terms and say this in your privacy policy. The prompt tells the model to treat document contents as content only, never as instructions.

**Changing provider:** everything provider-specific is in `src/lib/ai/anthropic.ts` (two functions: count tokens, generate). I built it on Claude; another provider can be dropped in behind the same two functions.

## Agreement Studio (tool 05)
Pages: `/tools/agreements` (hub), `/tools/agreements/new` (form), `/tools/agreements/<id>` (editor), `/tools/agreements/explain`.
- **Draft with AI** from a sentence ("rental agreement for a 2BHK in Pune, ₹28,000, 11 months") or from one of 8 India-ready templates: NDA, rental (leave & licence), employment, freelance/service, website terms, partnership deed, non-solicitation, business plan. Templates ask the right questions, format ₹ amounts and dates, and show Indian legal notes (stamp duty and registration; non-competes after employment are generally unenforceable under section 27 of the Indian Contract Act, so the employment and non-solicit templates use non-solicitation and confidentiality instead). Missing details become `[placeholders]`; the AI is told never to invent names, amounts or dates.
- **Editor:** preview and Markdown edit, editable title, Draft/Final status, **Revise with AI** ("make the notice period 60 days"), and **version history**: every content change becomes a numbered version (written by a database trigger, labelled AI draft / AI revision / Edited / Restored) that you can view and restore.
- **Export:** Word (.docx, generated on the server with headings, numbered lists, tables and page numbers; drafts get a "DRAFT" footer), Markdown, Print → Save as PDF (print styles show only the document), **Save to Files** as Word, or as PDF when the PDF worker is configured.
- **Explain a contract:** upload any agreement (PDF, Word, text or photo) for a plain-language summary, a key-terms table, risks marked High/Medium/Low, missing or unusual clauses, and questions to ask before signing.
- **Credits:** same rules as Document Genius (shared helper `src/lib/ai/credited-task.ts`: count tokens → reserve → run → charge actual → refund on any failure; retries with the same request id are never charged twice). A draft typically uses 10–25 credits; about 45 are held while it runs. AI revise works on agreements up to ~36,000 characters (the whole document must come back in one answer); longer ones are refused before any credits are held.
- **Security:** agreements are visible to workspace members (row-level security); users can edit only title, text and status; only the server can label a change as AI-made; version rows can't be written or changed by users. Rendering never uses raw HTML.
- **Not legal advice:** every page shows a disclaimer. Have a lawyer review the templates' instructions (`src/lib/agreements/templates.ts`) before launch.

## Home page for visitors
Signed-out visitors to `/` see a landing page with an "What agreement do you need?" box; it sends them through sign-in and back to the new-agreement form with their text filled in. Signed-in users see the dashboard, which now has the same prompt in the hero card.

## File storage
Files are stored at `<workspace_id>/<uploader_id>/<file_id>-<safe_name>` in the private bucket. The database enforces:
- only workspace members can read a workspace's files (via signed links; nothing is public);
- users can upload only into their own folder, in workspaces they belong to;
- users can overwrite only their own files; owners/admins can also delete others' files;
- quarantined or deleted files can no longer be downloaded.

`src/lib/storage/files.ts` has the app-side helpers: `uploadWorkspaceFile` (checks size/type, uploads, records it in `files`, and cleans up if the record fails), `getFileDownloadUrl` (60-second signed link) and `deleteWorkspaceFile`. New files start as `scan_status = 'pending'`; a server-side scanner still needs to mark them `clean` or `quarantined`.

All job writes, credit mutations, billing webhook events, usage writes, and audit log writes remain server-side only.

### Testing the security rules
`supabase/tests/run_local.sh` runs all migrations on a throwaway local Postgres with a minimal Supabase stand-in and checks 135 cases (tables, file storage, onboarding, credits, AI jobs, preferences, file types, payments, refunds, agreements); the worker has its own 23-check suite (`pdf-worker/test.mjs`) across four users and a signed-out visitor. Never point it at the real project.

## GitHub
Suggested new repository name: `geniusai-workspace`. Create it as an empty repository first, then upload this package’s contents or push the extracted folder. No existing repository should be overwritten.
