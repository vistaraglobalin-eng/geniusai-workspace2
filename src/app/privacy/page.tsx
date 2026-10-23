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
          <li>You can download your data, and ask us to correct or delete it, at any time.</li>
        </ul>

        <h2>2. What we collect</h2>
        <ul>
          <li><strong>Account details:</strong> your email address and the name you give us.</li>
          <li><strong>Workspace details:</strong> workspace name, type (personal or business), currency, and who the members are.</li>
          <li><strong>Your files and results:</strong> documents and images you upload, files our tools create, and AI results (summaries, translations, extracted text and tables).</li>
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

        <h2>4. AI processing</h2>
        <p>
          When you run an AI task (for example Summarize, Translate, Extract text, PDF to Markdown or Extract tables), the file you choose and your
          instructions are sent to Anthropic, which provides the Claude AI model, to produce the result. The result is stored in your workspace.
          Files are not sent to the AI provider unless you run an AI task on them. AI output can be wrong; check important details against the original.
        </p>

        <h2>5. Who we share data with</h2>
        <p>We share data only with service providers that help us run {SITE.productName}, under contracts that limit how they may use it:</p>
        <ul>
          <li><strong>Supabase:</strong> database, sign-in and file storage. Our project is hosted in the Mumbai (ap-south-1) region.</li>
          <li><strong>Anthropic:</strong> AI processing when you run an AI task.</li>
          <li><strong>Razorpay:</strong> payment processing.</li>
          <li><strong><Detail value={SITE.hosting} />:</strong> hosting for the web app.</li>
          {SITE.pdfWorkerHost && <li><strong><Detail value={SITE.pdfWorkerHost} />:</strong> processing for some PDF tools (compress, repair, protect, unlock, Office to PDF, PDF to JPG). Files are deleted immediately after processing.</li>}
          <li><strong><Detail value={SITE.emailProvider} />:</strong> sending sign-in emails.</li>
        </ul>
        <p>We may also disclose data if required by law, or to protect the rights and safety of our users or the public. We never sell personal data.</p>
        <p>Some providers (including Anthropic) may process data outside India. Where this happens, we rely on safeguards permitted under Indian law.</p>

        <h2>6. How long we keep it</h2>
        <ul>
          <li>Account and workspace data: while your account is active.</li>
          <li>Files and results: until you delete them, or your account is deleted.</li>
          <li>Payment and tax records: for as long as Indian tax and accounting laws require, even after account deletion.</li>
          <li>Security logs: for a limited period kept by our providers.</li>
        </ul>

        <h2>7. How we protect it</h2>
        <p>
          Data is encrypted in transit (HTTPS) and at rest by our storage provider. Access is restricted per workspace by database rules, files are
          stored privately and shared only through short-lived links, and payment secrets stay on our servers. No system is perfectly secure; if a
          personal data breach affects you, we will notify you and the authorities as the law requires.
        </p>

        <h2>8. Your rights</h2>
        <ul>
          <li><strong>Access:</strong> download your data any time from Settings → Privacy &amp; security → Download my data.</li>
          <li><strong>Correction:</strong> update your name in Settings, or ask us to correct other data.</li>
          <li><strong>Erasure:</strong> delete files yourself from Files, or email us to delete your account and data (except records we must keep by law).</li>
          <li><strong>Grievances:</strong> contact our Grievance Officer (below). If you&apos;re not satisfied, you may complain to the Data Protection Board of India.</li>
          <li><strong>Nomination:</strong> you may nominate someone to exercise these rights for you in case of death or incapacity.</li>
        </ul>

        <h2>9. Cookies</h2>
        <p>
          We use only essential cookies: sign-in cookies that keep you logged in, and a preferences cookie that remembers your theme. We don&apos;t use
          advertising or third-party tracking cookies. Razorpay may set its own cookies inside the payment window.
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
