import type { Metadata } from "next";
import Link from "next/link";
import { PublicLayout, Detail } from "@/components/PublicLayout";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Refund & Cancellation Policy · GeniusAI Workspace", description: "Refunds and cancellations for GeniusAI Workspace credit packs." };

export default function RefundsPage() {
  const days = SITE.refundWindowDays;
  return (
    <PublicLayout current="/refunds">
      <article className="legal">
        <p className="legal-eyebrow">Last updated {SITE.lastUpdated}</p>
        <h1>Refund &amp; Cancellation Policy</h1>
        <p className="legal-lead">
          {SITE.productName} sells one-time credit packs for its AI tools. This policy explains when you can get your money back, and how.
        </p>

        <h2>Cancellation</h2>
        <p>
          There are no subscriptions and nothing renews automatically, so there is nothing to cancel. You are only charged when you choose to buy a
          credit pack. The free PDF tools never cost anything.
        </p>

        <h2>Refunds for unused credit packs</h2>
        <p>
          If you haven&apos;t used any credits from a pack, you can ask for a full refund within <strong>{days} days</strong> of buying it. If you
          have used some of that pack&apos;s credits, it isn&apos;t refundable. Welcome credits and credits given for free can&apos;t be exchanged
          for money.
        </p>

        <h2>Failed tasks</h2>
        <p>
          If an AI task fails, the credits reserved for it are returned to your balance automatically. You only pay credits for what a successful
          task actually uses.
        </p>

        <h2>Payment problems</h2>
        <ul>
          <li><strong>Charged but no credits:</strong> credits are normally added within a minute. If they aren&apos;t, contact us with the payment date and amount; we&apos;ll add the credits or refund you.</li>
          <li><strong>Charged twice:</strong> we&apos;ll refund the duplicate payment in full.</li>
          <li><strong>Payment failed:</strong> you haven&apos;t been charged. Any amount your bank held is usually released by the bank automatically within a few working days.</li>
        </ul>

        <h2>How to ask for a refund</h2>
        <p>
          Email <Detail value={SITE.supportEmail} /> from the email address you sign in with, including the date and amount of the purchase. We reply
          within {SITE.supportResponseHours} hours. Approved refunds are sent back to the original payment method through Razorpay; banks usually take
          5–7 working days to show them in your account. The refunded credits are removed from your workspace.
        </p>

        <p className="legal-note">See also our <Link href="/terms">Terms of Service</Link> and <Link href="/pricing">Pricing</Link>.</p>
      </article>
    </PublicLayout>
  );
}
