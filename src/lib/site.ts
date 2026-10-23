// Business details used on the public Pricing, Terms, Privacy, Refunds and Contact pages.
//
// FILL THESE IN before launch. Anything still in [square brackets] is shown
// highlighted in yellow on the pages, so it can't slip through unnoticed.
// Razorpay checks that these match your Razorpay account.

export const SITE = {
  productName: "GeniusAI Workspace",
  legalName: "Vistara Global LLP",            // e.g. "Vistara Global Private Limited" or proprietor's name
  businessType: "limited liability partnership",
  address: "102-103, One Way Traffic Road, Mansa, Punjab 151505, India",
  supportEmail: "vistaraglobal.in@gmail.com",
  supportPhone: "",                         // optional; set to "" to hide
  grievanceOfficer: {
    name: "Vanish Kumar",
    email: "vistaraglobal.in@gmail.com"
  },
  gstin: "",                                                 // add when registered, e.g. "27ABCDE1234F1Z5"; empty hides it
  jurisdictionCity: "Mansa",                                // courts for disputes, e.g. "Mumbai"
  hosting: "Vercel",                                         // where the web app runs
  emailProvider: "Supabase",                                 // who sends sign-in emails (change when you add Resend etc.)
  pdfWorkerHost: "",                                         // empty until the PDF worker is deployed; hides it from the Privacy Policy
  lastUpdated: "24 October 2026",
  refundWindowDays: 7,
  supportResponseHours: 48
} as const;

/** True for values that still need to be filled in. */
export function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}
