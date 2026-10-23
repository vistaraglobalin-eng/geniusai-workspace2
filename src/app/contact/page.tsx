import type { Metadata } from "next";
import { Building2, Mail, Phone, ShieldCheck } from "lucide-react";
import { PublicLayout, Detail } from "@/components/PublicLayout";
import { SITE, isPlaceholder } from "@/lib/site";

export const metadata: Metadata = { title: "Contact · GeniusAI Workspace", description: "How to reach the GeniusAI Workspace team." };

function MailLink({ email }: { email: string }) {
  return isPlaceholder(email) ? <Detail value={email} /> : <a href={`mailto:${email}`}>{email}</a>;
}

export default function ContactPage() {
  return (
    <PublicLayout current="/contact">
      <article className="legal">
        <h1>Contact us</h1>
        <p className="legal-lead">Questions, problems with a payment, or a privacy request? We reply within {SITE.supportResponseHours} hours on working days.</p>

        <div className="contact-grid">
          <section className="panel-card contact-card">
            <Mail size={20} aria-hidden="true" />
            <h2>Support</h2>
            <p>Help with your account, tools, credits and refunds.</p>
            <p><MailLink email={SITE.supportEmail} /></p>
            {SITE.supportPhone && <p><Phone size={14} aria-hidden="true" /> <Detail value={SITE.supportPhone} /></p>}
          </section>
          <section className="panel-card contact-card">
            <ShieldCheck size={20} aria-hidden="true" />
            <h2>Grievance Officer</h2>
            <p>Privacy requests and complaints about how your data is handled.</p>
            <p><Detail value={SITE.grievanceOfficer.name} /><br /><MailLink email={SITE.grievanceOfficer.email} /></p>
          </section>
          <section className="panel-card contact-card">
            <Building2 size={20} aria-hidden="true" />
            <h2>Business details</h2>
            <p><Detail value={SITE.legalName} /><br /><Detail value={SITE.address} /></p>
            {SITE.gstin && <p>GSTIN: {SITE.gstin}</p>}
          </section>
        </div>

        <p className="legal-note">For payment issues, please include the date and amount of the payment. Never send us your card number, CVV, UPI PIN or OTP.</p>
      </article>
    </PublicLayout>
  );
}
