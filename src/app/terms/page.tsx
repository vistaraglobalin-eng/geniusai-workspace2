import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout, Detail } from "@/components/PublicLayout";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service · GeniusAI Workspace", description: "The terms for using GeniusAI Workspace." };

export default function TermsPage() {
  return (
    <PublicLayout current="/terms">
      <article className="legal">
        <p className="legal-eyebrow">Last updated {SITE.lastUpdated}</p>
        <h1>Terms of Service</h1>
        <p className="legal-lead">
          These terms are an agreement between you and <Detail value={SITE.legalName} /> (a <Detail value={SITE.businessType} />,{" "}
          <Detail value={SITE.address} />), the operator of {SITE.productName}. By creating an account or using the service, you agree to them.
          If you use {SITE.productName} for an organisation, you confirm you can accept these terms on its behalf.
        </p>

        <h2>1. The service</h2>
        <p>
          {SITE.productName} is an online workspace with AI tools (such as summarising, translating and extracting text and tables from documents,
          and drafting agreements), PDF tools (such as merging, splitting, editing, signing, converting and password-protecting files), signature
          requests, invoices and receipts, product photo and ad design, and resume tools. We may add, change or remove features over time.
        </p>

        <h2>2. Your account</h2>
        <ul>
          <li>You must be at least 18 years old.</li>
          <li>Keep access to your email secure: anyone who can open your sign-in emails can access your account.</li>
          <li>Workspace owners control who is in their workspace. Everyone in a workspace can see its files and results.</li>
          <li>Tell us promptly at <Detail value={SITE.supportEmail} /> if you think your account has been misused.</li>
        </ul>

        <h2>3. Your content</h2>
        <p>
          You keep all rights to the files you upload and the results you create. You give us permission to store, process and transmit them only as
          needed to run the service for you (including sending a file to our AI provider when you run an AI task). You confirm you have the right
          to upload and process your files.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to use {SITE.productName} to:</p>
        <ul>
          <li>break any law, or upload content that is illegal, infringes someone else&apos;s rights, or that you aren&apos;t allowed to share;</li>
          <li>remove passwords or restrictions from PDFs you don&apos;t own or don&apos;t have permission to change;</li>
          <li>upload malware, or try to break, overload, probe or bypass the security of the service;</li>
          <li>harass others, or create content that is abusive, deceptive or harmful;</li>
          <li>resell or provide the service to others without our written permission, or scrape it by automated means.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules, and report illegal activity where the law requires.</p>

        <h2>5. AI output</h2>
        <p>
          AI results are generated automatically and can be inaccurate, incomplete or out of date. They are not legal, financial, medical or other
          professional advice. Check important information against the original document before relying on it.
        </p>

        <h2>5A. Electronic signatures</h2>
        <ul>
          <li>Sign PDF and Request signatures create electronic records of a person agreeing to sign: a drawn or typed signature placed on the document, with a signing certificate (names, times, IP address, device and the document&apos;s fingerprint).</li>
          <li>Electronic contracts are generally recognised in India (Information Technology Act, 2000, section 10A), but these signatures are <strong>not</strong> Aadhaar eSign or a Digital Signature Certificate (DSC). Whether a particular document can be signed this way, and how much weight a court gives it, depends on the law and the facts.</li>
          <li>Some documents can&apos;t be signed electronically under the First Schedule of the IT Act, including wills, powers of attorney, trusts, negotiable instruments other than cheques, and contracts for the sale or conveyance of immovable property. Some others need stamping or registration. Take legal advice if unsure.</li>
          <li>You are responsible for sending signing links only to the intended people. Anyone with a signing link can sign as that person, so don&apos;t share it with others.</li>
        </ul>

        <h2>5B. Invoices and receipts</h2>
        <p>
          The invoice tools follow the usual GST invoice format and calculate tax from the rates and details you enter, but you are responsible for
          the accuracy of every document, the GST rates and HSN/SAC codes you choose, and your tax filings. The tools don&apos;t generate e-invoices
          (IRN) on the government portal or e-way bills. This isn&apos;t tax advice; check with your accountant.
        </p>

        <h2>5C. Photos, ads and resumes</h2>
        <ul>
          <li>Use only photos, logos and brand names you have the right to use. Ads you create must be truthful and follow the rules of the marketplaces and platforms where you post them.</li>
          <li>Resumes and cover letters must be truthful. AI suggestions may contain errors or placeholders; check and correct them before sending.</li>
          <li>Private links to files can be opened by anyone who has the link until it expires. Share them only with people you trust.</li>
        </ul>

        <h2>6. Credits and payments</h2>
        <ul>
          <li>AI tools use credits. The number of credits a task may use is shown before it runs, and only what it actually uses is charged. Failed tasks don&apos;t use credits.</li>
          <li>Credits are bought in one-time packs through Razorpay. There is no subscription and no automatic renewal.</li>
          <li>Credits belong to the workspace they were bought for, have no cash value, can&apos;t be transferred, and don&apos;t expire while your account is active.</li>
          <li>Prices are shown on the <Link href="/pricing">Pricing</Link> page and may change; changes don&apos;t affect credits you already have.</li>
          <li>Refunds are covered by our <Link href="/refunds">Refund &amp; Cancellation Policy</Link>.</li>
        </ul>

        <h2>7. Availability</h2>
        <p>
          We work to keep {SITE.productName} available and your data safe, but the service is provided “as is” and may sometimes be unavailable
          (for example during maintenance or provider outages). Keep your own copies of important files.
        </p>

        <h2>8. Liability</h2>
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses (such as lost profits or data), and our total
          liability for any claim relating to the service is limited to the amount you paid us in the 12 months before the claim. Nothing in these
          terms limits liability that can&apos;t be limited by law.
        </p>

        <h2>9. Ending your use</h2>
        <p>
          You can stop using the service and ask us to delete your account at any time. We may suspend or end access if you seriously or repeatedly
          break these terms, or if required by law; where reasonable, we&apos;ll tell you first and give you a chance to download your files.
        </p>

        <h2>10. Changes to these terms</h2>
        <p>We may update these terms. We&apos;ll post changes here and, for significant changes, tell you by email or in the app before they take effect.</p>

        <h2>11. Law and disputes</h2>
        <p>
          These terms are governed by the laws of India. Courts in <Detail value={SITE.jurisdictionCity} /> have jurisdiction, subject to any rights
          you have as a consumer. Please contact us first; most issues can be solved quickly.
        </p>

        <h2>12. Contact</h2>
        <p>
          <Detail value={SITE.supportEmail} /> · <Detail value={SITE.address} />. See also our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </PublicLayout>
  );
}
