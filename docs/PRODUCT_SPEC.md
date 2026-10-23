# GeniusAI Workspace — Product spec: workspace experience

Version 1 · 23 Oct 2026 · Status: Phase 1 built (see §9), later phases proposed

This spec defines the everyday workspace around the five AI tools: how people find their files, move around the app on any device, make it look the way they like, and stay in control of their data. Lumin (luminpdf.com) was used as a **functional reference only** — for the kinds of jobs a document workspace must do well. Nothing here copies Lumin's visual design, naming or branding; GeniusAI keeps its own identity (calm lavender palette, Manrope/DM Sans type, "Genius" tool naming, AI-first positioning).

---

## 1. What we take from the reference, and what we avoid

| Lumin does well (keep the *function*) | How GeniusAI does it its own way |
|---|---|
| One home for all documents, with search | **Files** library shared by all five tools, searchable from anywhere (⌘/Ctrl K) |
| Works on desktop, tablet and phone | One responsive web app: sidebar → icon rail → bottom tab bar |
| Sign, fill and mark up PDFs | Phase 3: Sign & request signatures, with a completion certificate |
| Share with permissions | Phase 2: invite members with roles; expiring view-only links |
| Templates and integrations (Google Drive) | Phase 3: templates per tool; Google Drive import |
| Easy to learn | Three-click rule: any tool result reachable in ≤3 actions from Home |

| Reviewers' complaints about Lumin | GeniusAI's design response |
|---|---|
| Interface "bulky / complicated", occasionally glitchy | One primary action per screen, progressive disclosure, no modal stacks |
| Surprise renewal charge, slow refunds | Credits are prepaid and visible everywhere; renewal reminders 7 days ahead; one-click cancel (Phase 2) |
| Free-tier caps that appear mid-task | Credit cost shown *before* a task runs; no task starts that can't finish |
| Problems with large files / offline | Clear size limits stated at upload; PWA offline shell for viewing recent results (Phase 3) |

---

## 2. Assumptions (and the options if they're wrong)

| # | Assumption | If not — options |
|---|---|---|
| A1 | "Lumin" means Lumin PDF's document workspace (library, PDF tools, e-sign, sharing). | If you meant a different product, the structure (§3) still holds; swap the Phase 3 items. |
| A2 | Primary users: individuals and small businesses in India, mostly on phones and laptops. | Enterprise focus → move SSO, admin console and audit export into Phase 2. |
| A3 | Web app first (responsive + installable PWA), no native apps yet. | Native later via Capacitor wrapping the same app; push notifications need it. |
| A4 | Stack stays Next.js + Supabase + Claude; data stays in Supabase's Mumbai region. | Another AI provider can sit behind `src/lib/ai/` without UI changes. |
| A5 | Theme preferences are per **person** (follow them across workspaces and devices). | Per-workspace branding (logo, accent) is a Phase 2 option for business workspaces. |
| A6 | A workspace's files are visible to all its members (current behaviour). | Private folders inside a workspace: Phase 2 option (adds folder-level permissions). |
| A7 | Payments via Razorpay (INR, UPI, cards). | Stripe if selling mainly outside India. |

---

## 3. Interface structure

### 3.1 Navigation map
```
Home (overview)            /
├─ Files (library)         /files            search · filter · sort · upload
├─ Tools
│  ├─ Document Genius      /tools/documents  ✅ live
│  ├─ Resume & Career      /tools/career     coming soon
│  ├─ Photo & Ad Studio    /tools/creative   coming soon
│  ├─ Invoices & Receipts  /tools/invoices   coming soon
│  └─ Contract Explainer   /tools/contracts  coming soon
├─ Plans & credits         /#plans → /billing (Phase 2)
└─ Settings                /settings
   ├─ Profile                                 name, email (read-only)
   ├─ Workspace                               name, type, currency (owner)
   ├─ Appearance                              theme, accent, text size, motion
   └─ Privacy & security                      sessions, data export, AI data use, delete (Phase 2)
```

### 3.2 Layout by device

| Width | Navigation | Content | Notes |
|---|---|---|---|
| **Desktop ≥1100px** | Full sidebar (labels) | Max 1330px, two-column cards | Upload button top-right; ⌘K search in top bar |
| **Tablet 761–1099px** | 72px icon rail with labels in tooltips | One or two columns | Touch targets ≥44px; same shortcuts with keyboard |
| **Phone ≤760px** | **Bottom tab bar**: Home · Files · Documents · Settings | One column, sticky primary action | Thumb-reachable; no hover-only actions; safe-area padding |

### 3.3 Screen anatomy (every signed-in page)
1. **Top bar**: breadcrumb (Workspace / Page), account avatar.
2. **Page header**: eyebrow, title, one-line purpose, one primary action.
3. **Body**: cards in a grid; each card has a title, a one-line description and at most one primary button.
4. **Feedback**: inline messages next to what caused them (never a blocking alert), `role="status"` / `role="alert"` for screen readers.
5. **Empty states** always say what to do next and offer the action.

---

## 4. Features

Priority: **P0** = Phase 1 (built in this revision) · **P1** = Phase 2 (next) · **P2** = Phase 3.

### 4.1 Appearance & themes — P0 ✅ built
**What:** Light, Dark or System theme; six accent colours (Lavender — the brand default — Ocean, Emerald, Sunset, Rose, Graphite); text size (Default / Large); Reduce motion (On / Off / Follow device).

**How it works**
- All colours are **design tokens** (CSS custom properties). Components never hard-code colours, so a theme is just a different token set. Accent colours change only the accent tokens; surfaces and text stay tuned for contrast.
- Each accent has light- and dark-mode values checked against WCAG AA (≥4.5:1 for text on its button and as link text on the page background).
- The choice is saved **twice**: in a small first-party cookie (so the server renders the right theme on the very first byte — no white flash in dark mode), and in the user's profile (so it follows them to other devices; restored at sign-in).
- "System" follows the device setting and updates live when the device switches.
- Settings → Appearance shows a live preview; changes apply instantly, no save button.

### 4.2 Settings — P0 ✅ built
- **Profile:** display name (1–80 chars); email shown read-only (changing email is a Phase 2 flow with confirmation to both addresses).
- **Workspace:** name, personal/business, default currency. Only the **owner** can edit (enforced in the database); others see read-only values.
- **Privacy & security:**
  - *Sign out of all devices* — ends every session for this account (useful after using a shared or lost device).
  - *Download my data* — a JSON file with your profile, workspaces, file list (names, sizes, dates) and your AI results. Files themselves are downloaded from Files.
  - *How AI uses your files* — plain-language explanation: files go to the AI provider only when you run a task; results are stored in your workspace.
  - *Delete account* — Phase 2 (needs ownership hand-over rules for shared workspaces).

### 4.3 Files library — P0 ✅ built
**What:** one place for every file in the workspace, shared by all tools.
**How it works**
- Search by name (server-side, case-insensitive, debounced 250 ms; the URL holds the query, so results are linkable and Back works).
- Filter by type: All · PDFs · Images · Word · Spreadsheets & CSV · Text.
- Sort: Newest · Oldest · Name · Size.
- 30 files per page with "Load more" (keeps first paint fast on phones).
- Each row: type icon, name, size, date, scan status, actions (Download, **Open in Document Genius**, Delete with two-step confirm). Quarantined files can't be downloaded.
- Drag-and-drop upload on desktop/tablet; button on phones.

### 4.4 Responsive navigation — P0 ✅ built
Sidebar → icon rail → bottom tab bar as in §3.2. The current page is marked with `aria-current="page"`, every icon has a text label (visible or accessible), and the bottom bar respects the phone's safe area.

### 4.5 Quick search & command palette — P1
⌘K / Ctrl K (or the search icon on phones) opens one box that searches files, results and actions ("Translate…", "Upload", "Settings"). Arrow keys + Enter, Esc to close, focus returns where it was. Results load from an index (see 4.7).

### 4.6 Folders, starring and trash — P1
- Folders (one level deep to start), drag files into them; **Starred** for quick access on Home.
- Delete moves to **Trash** for 30 days, then a scheduled job removes the stored object. Restore is one click. Owners can empty trash.

### 4.7 Full-text search — P1
When Document Genius extracts or summarizes a file, store its text in a `file_text` table with a Postgres full-text index (`tsvector`, plus `pg_trgm` for typo-tolerant names). Search then finds words *inside* documents, scoped by row-level security.

### 4.8 File preview — P1
Click a file to preview without downloading: PDFs via PDF.js (lazy-loaded only on that page), images inline, text/CSV as text. Preview uses short-lived signed links; nothing is cached publicly.

### 4.9 Team members & sharing — P1
- Invite by email with a role (Admin, Member, Viewer). Invitations expire after 7 days; accepting requires sign-in with that email.
- **Share link** for a single file or result: view-only, expires (1 day / 7 days / 30 days), optional download block; revoke anytime; every view logged.
- Admins can remove members; removal immediately ends their access (row-level security checks membership on every request).

### 4.10 Activity & notifications — P1
Per-workspace activity feed (uploads, AI tasks, invites, deletions) built on `audit_logs`; an in-app bell for "task finished", "invite accepted", "credits low (<20%)". Email notifications are opt-in per type.

### 4.11 Credits, plans and billing — ✅ credit packs built (revision 9); subscriptions P1
Razorpay (UPI, cards, netbanking). Credit packs and monthly plans; GST invoices downloadable; **renewal reminder 7 days before**, one-click cancel, cost shown before every AI task (already the case), usage history from `credit_ledger`.

### 4.12 Two-step sign-in (2FA) — P1
Optional authenticator-app codes via Supabase MFA; required for workspace owners on business plans (option). Recovery codes shown once.

### 4.13 PDF tools — ✅ first set built (revision 7); rest P2
**Built:** PDF Toolkit hub (`/tools/pdf`) grouped as Organize / Edit / Convert / AI, with merge, split, remove, extract, reorder, rotate, page numbers, watermark, JPG/PNG→PDF (all free and instant, via pdf-lib), plus AI tools linked into Document Genius (summarize, translate, OCR, PDF→Markdown, tables→CSV). Outputs are saved as new files; originals are untouched. iLovePDF's catalogue was used as a functional reference for which tools people expect.
**Built in revision 8 (PDF worker, `/pdf-worker`):** compress, repair, protect/unlock (AES-256), Word/Excel/PowerPoint/OpenDocument→PDF, PDF→JPG. **Still to do:** HTML→PDF, PDF/A. **Later, with care:** true redaction (must remove underlying text, not just cover it), compare PDFs, PDF→Word/PowerPoint (usually a paid conversion API), Unicode watermarks (embedded fonts).

### 4.14 Sign & request signatures — P2
Draw/type/upload a signature (stored encrypted, per user); place it on a PDF; or request signatures from others by email with signing order. Completed documents get a **completion certificate** (who, when, IP, document hash) appended and are locked.

### 4.15 Templates — P2
Saved prompts and document templates per tool (e.g. "Rental agreement summary", "GST invoice"); workspace-shared or personal.

### 4.16 Comments & annotations — P2
Highlight and comment on PDFs and results; @mention members; resolve threads.

### 4.17 Integrations — P2
Google Drive and OneDrive import (read-only picker, user-initiated), save results back to Drive. Gmail attachment import later.

### 4.18 Offline & install — P2
Installable PWA; offline shell shows recently opened results (stored encrypted in IndexedDB, cleared on sign-out). Uploads and AI tasks need a connection and say so.

### 4.19 Version history — P2
Re-running a task or editing a file keeps previous versions for 30 days; compare and restore.

---

## 5. Performance

**Budgets (measured on a mid-range Android, 4G):** Largest Contentful Paint < 2.5 s · Interaction to Next Paint < 200 ms · Layout shift < 0.1 · JavaScript per route < 150 KB gzipped.

**How**
- Server Components by default; client JavaScript only for interactive pieces (upload, tool forms, theme switcher).
- Theme resolved on the server from a cookie → no flash, no layout shift.
- Lists paginate (30 per page) and query only needed columns; indexes on `(workspace_id, created_at)` already exist.
- Heavy code (PDF.js, signature canvas) loaded only on the pages that use it.
- Next.js prefetches links in view, so moving between Home, Files and tools feels instant.
- Fonts: two families, `display=swap`; consider self-hosting via `next/font` to remove the external request (recommended next step).
- Images: thumbnails generated once and cached (Phase 2) instead of loading originals in lists.

## 6. Accessibility (target: WCAG 2.2 AA)
- Colour contrast ≥ 4.5:1 for text, ≥ 3:1 for UI boundaries, in **both** themes and **all** accents.
- Full keyboard use; visible focus ring (accent-coloured, 2 px, offset); skip-to-content link; no keyboard traps.
- Semantic landmarks (`nav`, `main`, `header`), headings in order, labelled form fields, `aria-current` on navigation, live regions for async results.
- Touch targets ≥ 44 × 44 px on touch devices; nothing that relies on hover.
- Text size setting plus browser zoom up to 200% without horizontal scrolling.
- Reduce-motion setting (also honours the device's preference).
- Plain language: messages say what happened and what to do next.

## 7. Security & privacy

**Already in place:** row-level security on every table; private storage bucket with per-workspace paths; short-lived signed download links; service-role key server-only; credits movable only by server functions; file records can't be marked "clean" by users; email-link sign-in; sign-in redirects restricted to the app.

**Added in Phase 1:** sign out of all devices; personal data export; theme cookie holds no personal data (`SameSite=Lax`, 1 year); security headers (content-type sniffing off, framing denied, strict referrer policy, permissions policy).

**Next (Phase 2):**
- Content Security Policy with nonces; rate limits on sign-in emails, uploads and AI runs (per user and per IP).
- Malware scanning worker that sets `scan_status` and removes quarantined objects.
- 2FA (4.12); session list with device names.
- Account deletion with a 7-day grace period and ownership transfer.
- Per-workspace setting: "Allow AI tools" on/off (for businesses that must keep certain files away from AI).
- Data retention: auto-delete files after N days (workspace setting), trash purge, AI results purge.
- India's Digital Personal Data Protection Act, 2023 (DPDP): consent notice at sign-up, purpose-limited processing, access/correction/erasure requests (export + delete cover most of this), breach-notification process, a named grievance contact. *Confirm the current rules and deadlines with a lawyer; this is not legal advice.*

## 8. Data model additions
| Phase | Change |
|---|---|
| 1 ✅ | `profiles.preferences jsonb` (theme, accent, text size, motion), validated by a check constraint |
| 2 | `folders`, `files.folder_id`, `files.starred_by uuid[]` or `file_stars`; `file_text` + full-text index; `workspace_invitations`; `share_links`; `notifications`; billing tables |
| 3 | `signatures`, `signature_requests`, `templates`, `comments`, `file_versions` |

## 9. Rollout
1. **Phase 1 (this revision):** themes & accents, Settings (profile, workspace, appearance, privacy & security), Files library, responsive navigation, security headers.
2. **Phase 2:** billing (Razorpay), command palette + full-text search, folders/star/trash, file preview, members & sharing, notifications, 2FA, malware scanning, CSP + rate limits, account deletion.
3. **Phase 3:** PDF tools, Sign, templates, comments, Drive import, PWA offline, version history — alongside the remaining four AI tools.

**Measure:** time to first successful AI result for new users; weekly active workspaces; tasks per user; % of failed tasks; Core Web Vitals from real users; support tickets about billing.

## 10. Decisions for you
1. **Accent palette:** keep the six proposed accents, or restrict to brand Lavender + Dark mode only (simpler brand)?
2. **Viewer role:** add a read-only "Viewer" role in Phase 2 (recommended for sharing with accountants/clients)?
3. **AI data controls:** should business workspaces be able to switch AI off entirely (recommended), or per folder?
4. **Retention defaults:** keep files until deleted (current), or auto-delete after e.g. 90 days unless starred?
5. **Billing:** Razorpay (India-first, recommended) or Stripe (global)?

## 11. Roadmap after revision 11 (Lumin / iLovePDF parity, GeniusAI's own design)
Lumin and iLovePDF were used only as a checklist of what people expect; names, layouts and wording are GeniusAI's own. Order is by value to Indian small businesses and freelancers, and by how much each builds on the last.

| # | Feature | How it should work | Builds on | Notes |
|---|---|---|---|---|
| 1 | **Sign (self-sign)** | Draw, type or upload a signature; place it, the date and initials on any PDF page; flatten and save as a new file with an audit page (who, when, IP, SHA-256 of the file). | PDF Toolkit, Files | pdf-lib; signatures stored per user, encrypted. Valid as an electronic signature for most commercial agreements in India (IT Act 2000, s.3A/5); **not** for wills, property sale deeds or negotiable instruments. Aadhaar eSign is a later paid integration. |
| 2 | **Request signatures** | Send an agreement (from Agreement Studio or Files) to signers by email with order; each gets a one-time link, signs, everyone gets the completed PDF + certificate; reminders and expiry. | #1 | Needs SMTP, a `signature_requests` table, rate limits; signer links are single-use and expire. |
| 3 | **Fillable forms** | Detect or add text fields, checkboxes, dates on a PDF; fill and save; "Fill & sign" combines with #1. | #1 | pdf-lib AcroForms. |
| 4 | **Edit PDF text & annotate** | Add text boxes, highlights, shapes, images, comments; whiteout. True in-place text editing is hard for arbitrary PDFs; start with overlay editing. | #3 | Unicode needs embedded fonts (Noto for Indian scripts). |
| 5 | **Templates library** | Save any agreement as a workspace template; share with members; template variables. | Agreement Studio | `templates` table, member-scoped. |
| 6 | **Collaboration** | Invite members; comments with @mentions on agreements and PDFs; activity log. | Phase 2 members | Notifications needed. |
| 7 | **Compare** | Compare two agreement versions (already stored) or two PDFs: highlighted differences. | Version history | Text diff first; visual diff later. |
| 8 | **Remaining PDF tools** | Crop, true redaction (removes underlying text), PDF/A, HTML→PDF, scan to PDF from phone camera, PDF→Word/Excel/PowerPoint. | Worker | PDF→Office quality usually needs a paid conversion API; say so in the UI. |
| 9 | **Drive / OneDrive import** | Pick files from Google Drive; save results back. | Files | OAuth, read-only scopes first. |
| 10 | **Developer API keys** | Workspace owners create API keys (shown once, stored hashed, scoped, revocable) to call PDF tools and Agreement Studio from their own apps; usage billed in credits; per-key rate limits. | Credits | `api_keys` table; never accept keys in URLs. |

**Recommended next:** #1 and #2 (signing) — they complete the Agreement Studio journey (draft → explain → sign) and are the most-asked-for feature in this category.
