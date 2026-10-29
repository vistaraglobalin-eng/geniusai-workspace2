import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { PublicLayout } from "@/components/PublicLayout";
import { LANGUAGES } from "@/lib/documents/tasks";
import { MAX_API_TEXT_CHARS, RATE_PER_MINUTE } from "@/lib/api/keys";

export const metadata: Metadata = {
  title: "Developer API · GeniusAI Workspace",
  description: "Use GeniusAI's document AI from your own app: summaries, translation, OCR, Markdown, tables, document Q&A, bank statements and quizzes."
};

function Code({ children }: { children: string }) {
  return <pre className="api-code"><code>{children}</code></pre>;
}

export default async function DevelopersPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-app.vercel.app";
  const base = `https://${host}/api/v1`;
  const file = `"file": { "name": "invoice.pdf", "mime_type": "application/pdf", "data": "<base64>" }`;

  return (
    <PublicLayout current="/developers">
      <article className="legal api-docs">
        <p className="legal-eyebrow">Developers</p>
        <h1>GeniusAI Workspace API</h1>
        <p className="legal-lead">Add GeniusAI&apos;s document AI to your own website, app or back office: summaries, translation into 25 languages, text and table extraction, Markdown, question answering, bank statements to structured data, and quizzes. Requests use your workspace&apos;s credits.</p>

        <h2>1. Get a key</h2>
        <p>The workspace owner or an admin creates keys in <Link href="/settings/api">Settings → Developer API</Link>. The key is shown once; keep it on your server, never in code that runs in a browser or app users can open.</p>

        <h2>2. Authenticate</h2>
        <p>Send the key in the <code>Authorization</code> header. Every request and response is JSON.</p>
        <Code>{`curl ${base}/me \\
  -H "Authorization: Bearer gai_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}</Code>
        <Code>{`{ "workspace": { "id": "…", "name": "Acme Pvt Ltd" },
  "key": { "name": "CRM", "prefix": "gai_live_Ab3d" },
  "credits": { "available": 1840, "reserved": 0 } }`}</Code>

        <h2>3. Send a document</h2>
        <p>Send either plain <code>text</code> (up to {MAX_API_TEXT_CHARS.toLocaleString("en-IN")} characters) or a <code>file</code> as base64 (PDF, Word .docx, text, CSV, PNG, JPEG or WebP, up to 3 MB). Files are processed in memory and are not saved to your workspace.</p>
        <Code>{`{ ${file} }`}</Code>

        <h2>Endpoints</h2>

        <h3>POST /documents/&#123;task&#125;</h3>
        <p>Tasks: <code>summary</code>, <code>translate</code> (also send <code>language</code>), <code>extract_text</code> (OCR), <code>markdown</code>, <code>tables</code> (CSV).</p>
        <Code>{`curl ${base}/documents/translate \\
  -H "Authorization: Bearer $GENIUSAI_KEY" -H "Content-Type: application/json" \\
  -d '{ "language": "Hindi", "text": "Payment is due within 30 days of the invoice date." }'`}</Code>
        <Code>{`{ "task": "translate", "text": "भुगतान चालान की तारीख से 30 दिनों के भीतर देय है।",
  "truncated": false, "credits_charged": 2, "job_id": "…" }`}</Code>
        <p className="api-small">Languages: {LANGUAGES.join(", ")}.</p>

        <h3>POST /chat</h3>
        <p>Answers a question from one document, citing pages for PDFs. Optional <code>history</code>: earlier turns as <code>[&#123; &quot;q&quot;: &quot;…&quot;, &quot;a&quot;: &quot;…&quot; &#125;]</code>.</p>
        <Code>{`{ "question": "What is the notice period?", ${file} }
→ { "answer": "30 days' written notice (p. 4).", "credits_charged": 3, … }`}</Code>

        <h3>POST /bank-statements</h3>
        <p>Every transaction from a statement PDF or photo, with each running balance and the closing balance checked. Only the last 4 digits of the account number are returned.</p>
        <Code>{`{ ${file} }
→ { "bank": "HDFC Bank", "account_last4": "4321", "period_from": "2026-09-01", "period_to": "2026-09-30",
    "opening_balance": 48210.5, "closing_balance": 75869.75,
    "checks": { "rows_checked": 42, "rows_mismatched": 0, "closing_matches": true },
    "transactions": [ { "date": "2026-09-01", "description": "UPI-SWIGGY-…", "mode": "UPI",
                        "debit": 456, "credit": 0, "balance": 47754.5, "balance_ok": true } ], … }`}</Code>

        <h3>POST /quiz</h3>
        <p>A multiple-choice quiz or flashcards. Options: <code>kind</code> (quiz | flashcards), <code>count</code> (5 | 10 | 20), <code>level</code> (easy | medium | hard), <code>language</code> (English, Hindi and 8 Indian languages), <code>focus</code>.</p>
        <Code>{`{ "kind": "quiz", "count": 5, "level": "medium", "language": "English", "text": "…chapter text…" }
→ { "title": "…", "questions": [ { "question": "…", "options": ["…","…","…","…"], "answer": 2,
                                    "explanation": "…", "source": "p. 3" } ], "credits_charged": 6, … }`}</Code>

        <h3>GET /me</h3>
        <p>The workspace, the key and the credit balance. Free.</p>

        <h2>Retries, limits and errors</h2>
        <ul>
          <li><strong>Safe retries:</strong> send an <code>Idempotency-Key</code> header (8–64 letters, digits, <code>_ . : -</code>). Repeating a request with the same key returns the first result without charging again.</li>
          <li><strong>Rate limit:</strong> {RATE_PER_MINUTE} requests a minute per key; above that you get <code>429</code> with <code>Retry-After</code>.</li>
          <li><strong>Credits:</strong> each AI request reserves credits, then charges only what it used. If you run out you get <code>402 insufficient_credits</code>; buy credits on the Plans page.</li>
          <li><strong>Errors</strong> look like <code>&#123; &quot;error&quot;: &#123; &quot;code&quot;: &quot;file_too_large&quot;, &quot;message&quot;: &quot;…&quot; &#125; &#125;</code>. Common codes: <code>unauthorized</code> (401), <code>bad_json</code> / <code>missing_document</code> (400), <code>insufficient_credits</code> (402), <code>file_too_large</code> (413), <code>unsupported_type</code> (415), <code>unreadable</code> / <code>too_long</code> (422), <code>rate_limited</code> (429).</li>
          <li>AI work can take up to a few minutes for long documents; use a client timeout of at least 300 seconds.</li>
        </ul>

        <h2>Privacy</h2>
        <p>Documents sent to the API are processed in memory and sent to the AI provider only for that request; they are not stored in your workspace. The workspace keeps a record of each request (endpoint, time, status and credits) so admins can see usage per key. Keys can be revoked at any time.</p>
        <p className="legal-note">Questions or need higher limits? <Link href="/contact">Contact us</Link>.</p>
      </article>
    </PublicLayout>
  );
}
