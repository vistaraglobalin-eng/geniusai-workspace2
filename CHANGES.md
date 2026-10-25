# Changes

## Revision 24: New look, Scanner, Stamps

- New look: off-white peach background, baby peach as the only accent, black pill buttons, serif titles, floating round dock on phones.
- Scan (/tools/scan): photos of paper become a straight, cleaned-up PDF. Auto edge detection, drag corners, rotate, Clean / Black & white / Grey / Original, reorder pages, A4/Letter/photo size, download, share or save to Files. Runs in the browser; photos are not uploaded until the PDF is saved.
- Scan & convert: choose Paper document, ID or passport (cropped, sharp, true colour, 2 per A4 for front and back) or Screenshot or photo (kept whole, full resolution). Also accepts a PDF. Save as HD PDF (on device), or Word (.docx), Text PDF (retyped, searchable) or plain text, read by AI (uses credits; reuses one reading for all formats).
- Find & replace in Edit PDF: search the text, see matches highlighted, replace every match in the same font size and colour.
- Redact in Edit PDF: drag black boxes, or "Redact all" for a search or for PAN, Aadhaar, phone, email, account numbers and GSTIN. On save, pages with redactions are rebuilt as images in the browser and the file is rebuilt from scratch, so hidden text is really removed. Saved as "<name> (redacted).pdf".
- Chat with a document (/tools/chat): ask questions about a PDF, Word file or photo; answers come only from the document, mention page numbers, reply in the question's language, keep the last 6 turns as context and are saved per person and file. Uses credits per question (ai_jobs task "chat"; no database change).
- Signing: bulk send (same PDF to up to 50 people, each a separate request with its own link), change a signer before they sign (old link stops working, new link emailed), email reminders per signer or for everyone (at most once per 20 hours), and a daily job (Vercel Cron, 10:00 IST) that closes expired requests and emails automatic reminders every 3 days, up to 3 times. Needs CRON_SECRET in Vercel and 202610250017_sign_reminders.sql.
- Spaces in Files: named folders (e.g. Clients, HR, GST 2026-27). Chips with counts, "Not in a space", create/rename/delete (files stay when a space is deleted), move any file with the folder button, uploads and drag-and-drop go into the open space. Needs 202610250018_spaces.sql; Files works without it until then.
- File page (/files/[id]): preview (PDF pages or image), Download, Share, Edit, Sign, Ask AI, and comments: threads with replies, comment on a page, resolve/reopen, delete, @mentions of workspace members. Mentions and replies go to the Inbox (/inbox, bell with unread count in the top bar) and by email once Resend is set up. Needs 202610250019_comments.sql.
- Templates library (/templates): 36 Indian formats in one searchable place (HR & staff, Money & GST, Agreements, Property & rent, Business, Personal, Brand & careers), marked Free (form, on device) or AI (drafted, uses credits).
- 8 new free letters: Employment certificate, Internship certificate, Warning letter, Resignation letter, Leave application, Letter to bank, Payment demand letter, Self-declaration.
- Share icons and signer badges follow the peach-only look.
- Stamps in Edit PDF: Approved, Paid, Received, Verified, Rejected, Draft, Confidential, Original, Copy, your own text, round company seal and "For <business> / Authorised Signatory", in red, blue, violet or black, with today's date.

## Revision 23: Reminders, Letters & Cards, Expenses, Team members

- **Payment reminders** (Invoices → Reminders, or *Send payment reminder* on an unpaid invoice): friendly / firm / final messages in English or Hindi with amount, due date, UPI ID and bank details; one tap to WhatsApp (straight to the customer's number), SMS, email, or PDF + text; reminder history saved on the invoice.
- **Business letters** (sidebar → Letters & Cards): offer, appointment (salary table), experience, relieving, salary slip, increment, NOC, authorisation, rent receipt (with revenue-stamp box) and custom letters; editable text; 4 letterhead styles; PDF and Word.
- **Visiting cards & letterhead**: 6 card designs, any colour, QR code (save contact / UPI / website), A4 sheet of 10 with crop marks, print-shop PDF with 3 mm bleed, PNG for WhatsApp; blank letterhead as PDF or Word.
- **Expense tracker** (sidebar → Expenses): amount, category, paid to, payment mode, GST in the bill (quick 5/18/40% buttons), vendor GSTIN, bill photo (compressed on the phone); monthly totals vs last month, category breakdown, search; Excel/CSV for the month or financial year, PDF report on letterhead. SQL: `202610240015_expenses.sql`.
- **Team members** (Settings → Team members, workspace switcher in the top bar): invite by link or email as Admin, Editor or Viewer; view-only people can't change data, upload, send for signing or spend credits (enforced in the database); change roles, remove people, leave a workspace; invite links expire after 7 days and work once. SQL: `202610240016_team.sql`.

## Revision 22: Resume & Career Studio, PDF to JPG on device

- **Resume & Career Studio** (dashboard → Grow your business, sidebar → Resumes, All tools): build resumes that save as you type, with a live preview of the real PDF.
- **4 templates** (Classic, Modern with optional photo, Compact, Executive), 8 colours; single-column, real-text PDFs that ATS screening software reads; **Word (.docx)** download too.
- Sections: contact, summary, experience (reorder), education (CGPA/%), skills, projects, certifications, achievements, languages, optional personal details and declaration (common for Indian employers).
- **Job match (free):** paste a job post, see a keyword score and which keywords are missing.
- **AI help (uses credits):** write the summary, improve bullet points, tailoring tips for a job post, and a cover letter (PDF / Word).
- Share, download, save to Files; duplicate and delete resumes.
- **PDF → JPG/PNG** now runs on the phone (no server needed).
- Database: run `supabase/migrations/202610240013_resumes.sql` once.

## Revision 21: Invoices & Receipts

- New **Invoices & Receipts** (dashboard → Grow your business, sidebar → Invoices, All tools).
- **Business details** once: name, address, state, GSTIN (checked, fills state and PAN), logo, bank, UPI ID, signature (draw or type), default terms, number prefixes, colour.
- **Tax invoice / bill of supply, quotation, payment receipt.** Numbers like INV/26-27/0001, consecutive and restarting each financial year (April–March), unique per business.
- **GST:** CGST + SGST for same-state sales, IGST for other states (from place of supply); slabs 0 / 5 / 18 / 40 % plus 3 % and 0.25 %; per-item discount; round-off; reverse-charge flag; amount in words in lakh/crore.
- **Customers** saved for next time (GSTIN check; state set from GSTIN).
- **PDF**: A4, logo, colour, HSN/SAC table, tax breakdown, bank details, **UPI QR code for the exact balance**, signature, multiple pages; ₹ and Indian-language names print correctly; searchable text layer.
- **Record payment** → creates a receipt and marks the invoice part paid / paid. **Quotation → invoice**, duplicate, cancel.
- List with **To collect, Overdue, Billed this month, Received this month**, tabs and search.
- **Share** (PDF, Word, images, link), download, or save the PDF to Files.
- Database: run `supabase/migrations/202610240012_invoices.sql` once.

## Revision 20: Product Photos & Ads

- New **Product Photos & Ads** studio (dashboard → Grow your business, sidebar → Photos & Ads, All tools).
- **Background removal on the phone:** automatic for product photos on plain or light backgrounds (picks a strict mode by itself for light products on light backgrounds), plus Erase / Restore brushes, Tap to remove, Undo and Redo automatically. Or keep the original background.
- **Sizes:** Marketplace 2000×2000 white (Amazon / Flipkart / Meesho), Post 1:1, Post 4:5, Story 9:16 (Reels / WhatsApp Status), Banner 1200×628.
- **Backgrounds:** white, soft colours, gradients, any colour, or the original photo; soft or floor shadow; resize and drag the product.
- **Ads:** four styles (Clean, Big sale, Split, Festive) with headline, line under it, price and struck-through old price, offer badge, button text, brand and phone; eight accent colours.
- **Save to Files**, **Share** (all formats via the share sheet) or **Download** as JPG or PNG.
- Nothing is uploaded until you save. Busy outdoor backgrounds need the brushes (an on-device AI cut-out can be added later).

## Revision 19: Automatic signing emails (Resend)

- When a signer has an email address, they get a "Please sign" email with their private link (in order, one after another, when that option is chosen).
- When everyone has signed, the sender and every signer get an email with a link to the signed PDF.
- If someone declines, the sender gets an email with the reason.
- Turned on by two Vercel settings: `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `GeniusAI Workspace <sign@yourdomain.com>`, on a domain verified in Resend). Optional `EMAIL_REPLY_TO`. Without them, nothing is emailed and links are shared by hand as before.

## Revision 18: Share in any format

- **Share button** on every file (Files, Edit PDF, Sign PDF, signature requests, and a signer's own copy).
- **Send as a file:** the PDF itself, a **Word (.docx)** file, or **JPG / PNG** images of each page; images can be sent as a PDF. Uses the phone's share sheet (WhatsApp, Mail, AirDrop, Files…), or downloads on a computer.
- **Private link** that expires after 1, 7 or 30 days, with Share / WhatsApp / Email / Copy.
- **Signature requests:** "Attach PDF" sends the signing link together with a copy of the PDF.
- Conversions run on the person's own device; files aren't uploaded anywhere to convert them.
- Fix: the signing page now opens for signers who aren't signed in (the PDF viewer file was behind the sign-in check).

## Revision 17: Request signatures

- **Send a PDF for others to sign:** choose a PDF, add up to 10 signers, and place signature, name and date fields for each one.
- **Private signing links:** every signer gets their own link to share by WhatsApp, email, the iPhone share sheet, or copy and paste. Signers don't need an account.
- **Signing order:** any order, or one after another.
- **Signer page:** review the document, draw or type a signature, agree to sign electronically, or decline with a reason. Works on phones.
- **Finished PDF:** when everyone has signed, all signatures are placed on the original and a signing certificate is added (names, times in IST and UTC, IP address, device, document fingerprint). It's saved to the sender's Files, and signers can download a copy.
- **Tracking:** Signature requests page with status, who has opened or signed, an activity log, and cancel / download.
- **Database:** run `supabase/migrations/202610240011_signature_requests.sql` once in the Supabase SQL editor.

## Revision 16: Edit PDF Pro

- **Edit existing text:** tap a line of text in the PDF to change it. The old line is covered with its own background colour and your new text is placed in a matching font, size and colour.
- **Mark up:** highlight, freehand marker, underline, squiggly underline, strikeout, sticky notes, and real PDF comments (they show in Acrobat, Preview and other readers, signed with your name).
- **Shapes:** box, circle, line, arrow and freehand drawing, with colour and thickness.
- **Links:** to a website (https added automatically; unsafe links refused) or to a page in the same PDF.
- **Forms:** fill the PDF's existing form fields, or add new text, multi-line, checkbox and dropdown fields.
- **Document:** bookmarks (outline), file attachments (up to 5 files, 2 MB each), and an option to flatten so nothing can be changed later.
- **Arrange:** bring to front / send to back, plus keyboard shortcuts.
- **Phone layout:** Save stays pinned; the Document panel sits below the pages and starts collapsed.

## Revision 15: Edit PDF (2026-10-24)
- **Edit PDF** `/tools/edit`: Text (sizes, Sans/Serif/Mono, bold, colours; Hindi and other scripts via browser rendering), Note (yellow comment card), Whiteout (cover and replace words), Highlight, Underline, Strikeout, Box, Draw (freehand, 3 pen sizes), Image (PNG/JPG). Select to move/resize/delete, Undo (also Ctrl/Cmd+Z), Delete key. Saved as a new file "(edited).pdf"; the original is never changed. Free.
- Engine `src/lib/pdf/edit.ts` (pdf-lib, vector output, correct on rotated and cropped pages); route `/api/edit`; shared browser renderer `src/lib/pdf/preview.ts`.
- Tested end to end in Chromium: real taps, drags and typing in the editor, then the captured edits applied by the server engine and the PDF rendered and compared with the screen.
- Linked from PDF Toolkit (Edit group), Home (Create & sign), All tools and Files.
- Feature checklist compared with iLovePDF's editor; still to come: editing existing text in place, links, form fields, comments as PDF annotations.

## Revision 14: Home dashboard (2026-10-24)
- Every tool and service has a fixed place, grouped by the job people come to do: **Create & sign** (Agreement Studio, Templates, Sign PDF, Request signatures soon), **Understand documents** (Explain a contract, Summarize, Translate, Extract text, Extract tables), **PDF tools** (Merge, Split, Compress, Convert to PDF, Protect, All PDF tools).
- Time-of-day greeting with today's date (IST), credits at a glance, Upload.
- "What do you want to get done?" request card with six one-tap shortcuts (Draft, Explain, Sign, Summarize, Translate, Merge), in iOS-style solid colour icon tiles.
- "Continue where you left off": latest agreements, latest files and credits. Upcoming tools shown quietly under "Coming soon".

## Revision 13: design refresh (2026-10-24)
- **Native-feeling type:** the device's own interface font (SF Pro on iPhone/Mac, Segoe UI on Windows, Roboto on Android, Noto Sans for Indian scripts). Google Fonts removed, so pages load faster.
- **Calmer palette:** neutral greys, near-black text, one indigo accent (#4F46E5) for actions; true-black dark mode with iOS-style grey surfaces.
- **Less decoration:** removed all-caps eyebrow labels, coloured words in headings, 01-05 numbers, the decorative orbit art on Home and glowing button shadows; labels are in sentence case.
- **iOS-style details:** frosted top bar, phone tab bar and site header; 44px buttons and inputs; segmented controls; hairline borders instead of card shadows; All tools is a compact list on phones; example prompts scroll sideways.
- **Home:** "What do you want to get done?" request field is the centrepiece, with links to common jobs; 5 quick PDF tools plus "See all".

## Revision 12: Sign PDF (2026-10-24)
- **Sign PDF** `/tools/sign`: draw or type a signature, place it on any page (tap, drag, resize, add to every page, optional date), save a signed copy to Files with a Signing record page and an audit-log entry (SHA-256 before and after). Free.
- Engine `src/lib/pdf/sign.ts` (pdf-lib) handles rotated and cropped pages; 10 checks plus rendered output inspected. Page previews use pdf.js (`pdfjs-dist` 6.2.108, legacy build) in the browser, tested in Chromium.
- Links from PDF Toolkit, All tools, Home quick tools and Files.
- Live-site fixes this round: escaped apostrophes (build), real AI error reasons (credit/key problems) logged to Vercel, USD and INR price lists with a currency switch, business details on policy pages.

## Revision 11: Agreement Studio and a public home page (2026-10-23)
- **Agreement Studio** (tool 05, replaces "Contract Explainer — coming soon"): draft agreements with AI from a prompt or 8 India-ready templates; editor with preview/edit, AI revise, Draft/Final status and version history with restore; export to Word (.docx), Markdown, Print/PDF, and Save to Files (Word, or PDF via the worker); **Explain a contract** with summary, key terms, risks, gaps and questions.
- **Database** `202610230010_agreements.sql`: `agreements`, `agreement_versions`, triggers that number versions automatically and stop users labelling edits as AI-made; column-level grants; 15 checks.
- **Shared AI helper** `src/lib/ai/credited-task.ts` for any credited AI task (idempotent, refunds on failure); 14 unit checks.
- **Safe Markdown** (`src/lib/markdown.ts`, `MarkdownView`): rendered as React elements / escaped HTML only; Word export via the `docx` package (new dependency).
- **Public home page** at `/` for signed-out visitors with a prompt box; signed-in Home gains the same prompt.
- **Navigation:** Agreement Studio in the sidebar; new `/tools` page; phone tab bar is now Home · Files · Tools · Agreements · Settings.
- **Roadmap** for the remaining Lumin/iLovePDF-style features in `docs/PRODUCT_SPEC.md` §11.

## Revision 10: public pricing and policy pages (2026-10-23)
- **Public pages** (no sign-in): Pricing (live from `credit_packs`, Free tier + packs + FAQ), Terms of Service, Privacy Policy (DPDP Act 2023: fiduciary, purposes, processors, retention, rights, Grievance Officer, cookies, children), Refund & Cancellation Policy, Contact. Shared public layout with header, footer and policy links.
- **Business details** in one file, `src/lib/site.ts`; unfilled `[placeholders]` are highlighted on the pages.
- **Consent & links**: sign-in page consent line, "By buying you agree…" on Billing, policy links in Settings; account-deletion wording aligned with the Privacy Policy.
- **Refunds**: migration `202610230009_refunds.sql` adds a `refunded` order status and `process_refund()` (server/SQL-editor only; refuses if the pack's credits were used); Billing shows refunds correctly in history.
- These pages satisfy the website requirements Razorpay checks before activating live payments (once details are filled in).

## Revision 9: buy credits with Razorpay (2026-10-23)
- **Billing page** `/billing`: balance, three credit packs (placeholder prices), Razorpay Checkout (UPI/cards/netbanking/wallets), purchase history and a readable credit history (credits added / used per AI task). Linked from the sidebar, Home and from Document Genius when credits run out.
- **Server**: `/api/billing/checkout` (price from DB, owner/admin only), `/api/billing/verify` (signature + captured-status + amount checks), `/api/billing/webhook` (HMAC-verified, duplicate-safe, retry-friendly). Razorpay client uses plain fetch + Node crypto.
- **Database** `202610230008_payments.sql`: `credit_packs`, `payment_orders`, `fulfil_payment()` (credits granted exactly once), `mark_payment_failed()`; all writes server-only.
- **Headers**: payment features allowed for Razorpay's checkout frame only; opener policy relaxed to allow payment popups (UPI/netbanking).
- **Env**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

## Revision 8: PDF worker, 6 more tools (2026-10-23)
- **New service `/pdf-worker`** (Node, no npm dependencies, Docker image): Compress (Ghostscript + qpdf, 3 levels, never returns a bigger file), Repair, Protect (AES-256; passwords passed via a private args file, never on the command line or in logs), Unlock, Office to PDF (LibreOffice, fresh profile per job, macros never run), PDF to JPG (72/150/300 dpi, ZIP for several pages). Shared-secret auth, 25 MB limit, timeouts, concurrency limit with a clear "busy" message, per-job temp folders deleted afterwards, non-root container.
- **Bug caught by tests:** passwords starting with `--` were read by qpdf as options; now passed with `--user-password=` so any password is treated as text.
- **App**: toolkit now has 15 tools in 5 groups (Organize, Optimize, Edit, Security, Convert); password fields with show/hide and confirmation; results can be PDF, JPG or ZIP; tools show "Setup needed" until the worker is configured.
- **Storage**: migration `202610230007_more_file_types.sql` allows PowerPoint, OpenDocument, RTF and ZIP. Files library gains a "Presentations" filter.
- **Env**: `PDF_WORKER_URL`, `PDF_WORKER_SECRET` (server-only).

## Revision 7: PDF Toolkit (2026-10-23)
- **PDF Toolkit** `/tools/pdf` + `/tools/pdf/<tool>`: merge, split, remove pages, extract pages, reorder, rotate, page numbers, watermark, JPG/PNG→PDF. Free, instant, saved to Files as new files. Multi-file tools let you set the order.
- **Engine** `src/lib/pdf/` (pdf-lib): friendly page-range parser; page numbers and watermarks stay upright on rotated pages; phone photos turned upright via EXIF; password-protected or damaged PDFs give clear messages.
- **API** `/api/pdf/run`: access checked through row-level security; all-or-nothing saving.
- **Document Genius**: new tasks *PDF to Markdown* (.md) and *Extract tables* (.csv, Excel-friendly UTF-8, formula injection neutralised). Tool hub links open Document Genius with the task preselected.
- **Navigation**: PDF Toolkit in the sidebar; phone tab bar now Home · Files · PDF tools · AI docs · Settings; "Quick PDF tools" strip on Home.
- **Fix found by type-checking**: Blob construction that would fail `next build` on TypeScript 5.9+.
- New dependency: `pdf-lib`.

## Revision 6: workspace experience, Phase 1 (2026-10-23)
- **Product spec** `docs/PRODUCT_SPEC.md`: recommended features (Lumin used as a functional reference only), interface structure per device, priorities, performance and accessibility targets, security & privacy plan, open decisions.
- **Themes**: whole stylesheet rebuilt on design tokens; Light/Dark/Match device; six accent colours; Large text; Reduce motion. All colour pairs checked for WCAG AA (63 checks). No theme flash: the server renders from a cookie.
- **Responsive navigation**: sidebar → tablet icon rail → phone bottom tab bar; skip link; `aria-current`; 44px touch targets on touch screens.
- **Files library** `/files`: search, type filters, sort, load more, drag-and-drop upload, "Open in Document Genius".
- **Settings** `/settings`: profile, workspace (owner-only edits), appearance, privacy & security (sign out everywhere, download my data, how AI uses files).
- **Fix**: the sidebar's Sign out was signing out of every device (Supabase default); now this device only.
- **Security**: response security headers; profile columns users can edit are restricted; clients can no longer insert profiles directly.
- **Migration** `202610230006_preferences_and_profile_hardening.sql`; tests `supabase/tests/preferences_tests.sql` (11); full suite 89 checks.

## Revision 5: Document Genius, the first AI tool (2026-10-23)
- **New page `/tools/documents`**: choose or upload a document, then Summarize, Translate (25 languages) or Extract text. Copy or download results; reopen past results. Linked from the dashboard tool card (now "Ready") and the sidebar.
- **API route `/api/documents/run`**: checks access, counts tokens, reserves credits, runs Claude, charges actual use, refunds on failure, safe against double-clicks.
- **Claude client** (`src/lib/ai/anthropic.ts`): plain `fetch`, no SDK; friendly errors for busy/overloaded/timeouts/bad files.
- **Credits** (`src/lib/ai/credits.ts`): 1 credit = 1,000 input tokens, output weighted 5×; provider cost recorded per job.
- **Migration `202610230005_ai_jobs_and_credits.sql`**: job inputs/results, `app_settings` (welcome credits = 200), and service-role-only `grant_credits`, `start_ai_job`, `complete_ai_job`, `fail_ai_job`. Stuck jobs release their credits after 15 minutes.
- **Shared page frame** (`src/components/AppShell.tsx`) used by the dashboard and tool pages; other tools now say "Coming soon".
- **New env vars**: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, optional `AI_MODEL`. New dependencies: `mammoth` (Word files), `server-only`.
- **Tests**: `supabase/tests/credits_tests.sql` (26 checks); full database suite is 78 checks.

## Revision 4: sign-in and onboarding (2026-10-22)
- **Sign-in**: passwordless email links (`/login`, `/auth/callback`, `/auth/signout`), with clear messages for expired links and email rate limits. Redirects after sign-in only go to pages inside the app.
- **Session handling**: `src/middleware.ts` refreshes the session and protects every page except `/login`, `/auth/*` and `/api/health`.
- **Onboarding** (`/onboarding`): name, personal or business, workspace name, currency (INR default). Backed by the new `complete_onboarding()` database function: one transaction, input checks, and no duplicate workspaces on double-submit.
- **Dashboard** now shows the signed-in user, their workspace and role, real credit balance and plan, and recent files with download and delete (two-step confirm). The upload button works. Unused "Help" button removed.
- **Migration** `202610220004_auth_onboarding.sql`: profile created automatically on sign-up (backfilled for existing users); signed-out callers can no longer run internal helper functions.
- **Downloads** save the file directly under its original name (avoids pop-up blockers).
- **Tests**: `supabase/tests/onboarding_tests.sql` (15 checks); full suite is 52 checks.

## Revision 3: private file storage (2026-10-22)
- New migration `202610220003_private_storage.sql`: private bucket `private-user-files` (25 MB, document/image types only) with access rules on `storage.objects`:
  members read; upload only to `<workspace>/<your user id>/<file>`; overwrite only your own; owners/admins may delete any file in their workspace; quarantined or soft-deleted files are not downloadable.
- `public.files` records must now point inside the uploader's own folder.
- `src/lib/storage/files.ts`: upload (with size/type checks and cleanup on failure), signed download link, delete; filenames are made storage-safe.
- Test suite extended: `supabase/tests/storage_tests.sql` (14 checks); `run_local.sh` runs everything (37 checks).

## Revision 2 (2026-10-22)
| Area | Problem | Fix |
|---|---|---|
| Config | README/.env used `NEXT_PUBLIC_SUPABASE_ANON_KEY`, code read `..._PUBLISHABLE_KEY` → client threw, health always false | One helper `src/lib/supabase/env.ts`; `.env.example` uses `PUBLISHABLE_KEY`, `ANON_KEY` still accepted |
| Lint | ESLint 9 had no flat config → `npm run lint` failed | Added `eslint.config.mjs` + `@eslint/eslintrc` |
| Database | Workspace owners were never added as members → locked out of their own files/jobs/credits | Trigger adds owner membership + credit account + audit log; backfill for existing workspaces |
| Database | Any member could update any column of any file row (e.g. mark a quarantined file `clean`) | Column-level grants; only uploader or owner/admin can rename/re-tag/soft-delete |
| Database | Clients could insert files pre-marked `clean` or with arbitrary storage keys | Insert limited to safe columns; key must start with `<workspace_id>/` |
| Database | Workspace owner column was writable (only the policy check stopped transfers) | Clients may update name/kind/currency only |
| Database | Misleading "security invoker" comment | `COMMENT ON FUNCTION` documents SECURITY DEFINER intent |
| Database | No `updated_at` maintenance; no `module_key` checks on files/usage; pricing unreadable when signed out | Triggers, check constraints, anon read on active plans; 10-workspace cap per user |
| UI | 8–10.5px text; upload button had a fake `onClick` | Larger type scale; button is `disabled` with a tooltip |

The original migration `202610220001` is unchanged because it is already applied.
