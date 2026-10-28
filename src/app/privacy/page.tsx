import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout, Detail } from "@/components/PublicLayout";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy · GeniusAI Workspace", description: "How GeniusAI Workspace collects, uses and protects your data." };

export default function PrivacyPage() {
  return (
    <PublicLayout current="/privacy">
      <article className="legal">
        <p className="legal-eyebrow">Last updated {SITE.lastUpdated}</p>
        <h1>Privacy Policy</h1>
        <p className="legal-lead">
          This policy explains what personal data {SITE.productName} (“we”, “us”) collects, why, who it is shared with, and the
          choices you have. {SITE.productName} is operated by <Detail value={SITE.legalName} />, <Detail value={SITE.address} />.
          We act as the Data Fiduciary for your personal data under India&apos;s Digital Personal Data Protection Act, 2023.
        </p>

        <h2>1. Summary</h2>
        <ul>
          <li>Your files are private to your workspace. They are never public and never sold.</li>
          <li>A file is sent to our AI provider only when you run an AI task on it.</li>
          <li>We don&apos;t see your card or UPI details. Payments are handled by Razorpay.</li>
          <li>Some tools work entirely on your device (photo background removal, converting PDFs to Word or images). Nothing is uploaded unless you save the result.</li>
          <li>If you send a document for signature, the people who sign it share their name, signature, IP address and device with you (see section 2).</li>
          <li>You can download your data, and ask us to correct or delete it, at any time.</li>
        </ul>

        <h2>2. What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your email address and the name you give us.</li>
          <li><strong>Workspace details:</strong> workspace name, type (personal or business), currency, and who the members are.</li>
          <li><strong>Your files and results:</strong> documents and images you upload, files our tools create, and AI results (summaries, translations, extracted text and tables).</li>
          <li><strong>Signature requests:</strong> the document you send, the names and (optional) email addresses of the people you ask to sign, and, when they sign, their typed name, signature image, IP address, browser/device type and the times they opened and signed. This appears on the signing certificate added to the signed PDF.</li>
          <li><strong>Invoices, quotations and receipts:</strong> your business details (name, address, GSTIN, PAN, logo, signature, bank account and UPI ID) and your customers&apos; details that you enter (name, address, GSTIN, phone, email), items, amounts and payments.</li>
          <li><strong>Resumes:</strong> the details you enter, such as contact details, work history, education, skills, an optional photo and optional personal details (date of birth, nationality), and any job post you paste for matching.</li>
          <li><strong>Shared links:</strong> when you create a private link to a file, anyone who has the link can open it until it expires.</li>
          <li><strong>Payments:</strong> which credit pack you bought, the amount, the date, and Razorpay&apos;s order and payment references. Not card, bank or UPI details.</li>
          <li><strong>Usage:</strong> which tools you use, credits used, and timestamps, so we can bill fairly and fix problems.</li>
          <li><strong>Technical data:</strong> information our providers log automatically, such as IP address, browser type and sign-in times, used for security.</li>
          <li><strong>Preferences:</strong> your theme, accent colour, text size and motion settings.</li>
        </ul>

        <h2>3. Why we use it</h2>
        <ul>
          <li>To provide the service: sign you in, store your files, run the tools you choose, and show your results.</li>
          <li>To process payments and keep accurate credit balances and tax records.</li>
          <li>To keep the service secure, prevent abuse, and fix errors.</li>
          <li>To contact you about your account, purchases, or important changes. We don&apos;t send marketing without your consent.</li>
        </ul>
        <p>We process your data on the basis of the consent you give when you sign up and use the service, and where the law otherwise permits (for example, to meet tax and legal obligations). You can withdraw consent at any time by deleting your account (see section 8); this doesn&apos;t affect processing that already happened.</p>

        <h2>3A. Information about other people</h2>
        <p>
          When you add other people&apos;s details (for example customers on an invoice, or the people you ask to sign a document), you decide
          why that data is used, and you are responsible for having their permission or another lawful reason to share it with us. We process it
          only to provide the service to you. People who sign through a link don&apos;t need an account; they can contact us at the address below
          to exercise their rights, and we will pass requests to the sender where appropriate.
        </p>
        <p>
          <strong>Team workspaces.</strong> When you invite someone, we store their email address (if you give one) and the invite until it is used,
          cancelled or expires (7 days). Everyone in a workspace can see its members&apos; names and email addresses and the workspace&apos;s shared content;
          the owner and admins control who has access. Expense entries and bill photos you add are stored in your workspace like your other files.
        </p>

        <h2>3B. Processing on your device</h2>
        <p>
          Background removal in Product Photos &amp; Ads, converting PDFs to Word or images, building invoice, resume and photo files, and the
          preview of your PDFs all happen in your own browser. The photo or file isn&apos;t sent to us for this; it is stored in your workspace only
          if you choose to save it.
        </p>

        <h2>4. AI processing</h2>
        <p>
          When you run an AI task (for example Summarize, Translate, Extract text, drafting or explaining an agreement, or the resume helpers such as writing a summary, improving bullet points, tailoring tips or a cover letter), the file or text you choose and your
          instructions are sent to Anthropic, which provides the Claude AI model, to produce the result. The result is stored in your workspace.
          Files are not sent to the AI provider unless you run an AI task on them. AI output can be wrong; check important details against the original.
        </p>

        <h2>5. Who we share data with</h2>
        <p>We share data only with service providers that help us run {SITE.productName}, under contracts that limit how they may use it:</p>
        <ul>
          <li><strong>Supabase:</strong> database, sign-in and file storage. Our project is hosted in the Mumbai (ap-south-1) region.</li>
          <li><strong>Anthropic:</strong> AI processing when you run an AI task.</li>
          <li><strong>Razorpay:</strong> payment processing.</li>
          <li><strong>Have I Been Pwned:</strong> when you create or change a password, your device checks it against known leaked passwords. Only the first 5 characters of a one-way code (hash) of the password are sent, never the password or your email.</li>
          <li><strong><Detail value={SITE.hosting} />:</strong> hosting for the web app.</li>
          {SITE.pdfWorkerHost && <li><strong><Detail value={SITE.pdfWorkerHost} />:</strong> processing for some PDF tools (compress, repair, protect, unlock, Office to PDF, PDF to JPG). Files are deleted immediately after processing.</li>}
          <li><strong><Detail value={SITE.emailProvider} />:</strong> sending emails: sign-in links and, when you send a signature request, the signing invitations and notifications.</li>
        </ul>
        <p>We may also disclose data if required by law, or to protect the rights and safety of our users or the public. We never sell personal data.</p>
        <p>Some providers (including Anthropic) may process data outside India. Where this happens, we rely on safeguards permitted under Indian law.</p>

        <h2>6. How long we keep it</h2>
        <ul>
          <li>Account and workspace data: while your account is active.</li>
          <li>Files and results: until you delete them, or your account is deleted.</li>
          <li>Signature requests and their signing records: while your account is active, so you can prove when and how a document was signed. The signing certificate also stays inside the signed PDF you keep.</li>
          <li>Invoices and receipts: until you delete them or your account is deleted. GST law may require you to keep tax invoices for several years; please download copies before deleting.</li>
          <li>Private links: they stop working when they expire (1, 7 or 30 days, as you choose); signing links when the request is completed, cancelled or expires.</li>
          <li>Payment and tax records: for as long as Indian tax and accounting laws require, even after account deletion.</li>
          <li>Security logs: for a limited period kept by our providers.</li>
        </ul>

        <h2>7. How we protect it</h2>
        <p>
          Data is encrypted in transit (HTTPS) and at rest by our storage provider. Access is restricted per workspace by database rules, files are
          stored privately and shared only through short-lived links, and payment secrets stay on our servers. No system is perfectly secure; if a
          personal data breach affects you, we will tell you without delay, explain what happened and what you can do, and report it to the
          Data Protection Board of India within the time the law requires (including a detailed report within 72 hours).
        </p>

        <h2>8. Your rights</h2>
        <ul>
          <li><strong>Access:</strong> download your data any time from Settings → Privacy &amp; security → Download my data.</li>
          <li><strong>Correction:</strong> update your name in Settings, or ask us to correct other data.</li>
          <li><strong>Erasure:</strong> delete files yourself from Files, or email us to delete your account and data (except records we must keep by law).</li>
          <li><strong>Grievances:</strong> contact our Grievance Officer (below). We will respond as soon as we can and resolve it within 90 days at most. If you&apos;re not satisfied, you may complain to the Data Protection Board of India.</li>
          <li><strong>Withdrawing consent:</strong> you can withdraw consent at any time; it&apos;s as easy as giving it (delete the data, or email us).</li>
          <li><strong>Nomination:</strong> you may nominate someone to exercise these rights for you in case of death or incapacity.</li>
        </ul>

        <h2>9. Cookies</h2>
        <p>
          We use only essential cookies: sign-in cookies that keep you logged in, and a preferences cookie that remembers your theme, and a cookie that remembers which workspace you last opened. We don&apos;t use
          advertising or third-party tracking cookies. Razorpay may set its own cookies inside the payment window.
        </p>
        <p>
          To see which features help and where people get stuck, we may count anonymous usage with PostHog: pages opened (with
          document IDs and private link codes removed), files uploaded (type only, never the content or name), and whether AI tasks
          succeeded. This uses a random number stored in your browser, not a cookie, and is never linked to your name, email or
          documents. It is turned off if your browser sends a &ldquo;Do Not Track&rdquo; or Global Privacy Control signal.
        </p>

        <h2>10. Children</h2>
        <p>{SITE.productName} is not intended for anyone under 18. Please don&apos;t use it if you are under 18.</p>

        <h2>11. Changes</h2>
        <p>We&apos;ll post any changes on this page and update the date at the top. For significant changes, we&apos;ll tell you by email or in the app.</p>

        <h2>12. Contact and Grievance Officer</h2>
        <p>
          Grievance Officer: <Detail value={SITE.grievanceOfficer.name} />, <Detail value={SITE.grievanceOfficer.email} />.<br />
          General questions: <Detail value={SITE.supportEmail} />. Postal address: <Detail value={SITE.address} />.<br />
          See also our <Link href="/terms">Terms</Link> and <Link href="/contact">Contact</Link> page.
        </p>
      </article>
    </PublicLayout>
  );
}
