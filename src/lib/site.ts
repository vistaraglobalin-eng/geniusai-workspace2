// Business details used on the public Pricing, Terms, Privacy, Refunds and Contact pages.
//
// FILL THESE IN before launch. Anything still in [square brackets] is shown
// highlighted in yellow on the pages, so it can't slip through unnoticed.
// Razorpay checks that these match your Razorpay account.

export const SITE = {
  productName: "GeniusAI Workspace",
  legalName: "[Your registered business name]",            // e.g. "Vistara Global Private Limited" or proprietor's name
  businessType: "[sole proprietorship / partnership / LLP / private limited company]",
  address: "[Registered address, City, State, PIN, India]",
  supportEmail: "[support@your-domain.com]",
  supportPhone: "[+91 XXXXX XXXXX]",                         // optional; set to "" to hide
  grievanceOfficer: {
    name: "[Grievance Officer's full name]",
    email: "[grievance@your-domain.com]"
  },
  gstin: "",                                                 // add when registered, e.g. "27ABCDE1234F1Z5"; empty hides it
  jurisdictionCity: "[City]",                                // courts for disputes, e.g. "Mumbai"
  hosting: "Vercel",                                         // where the web app runs
  emailProvider: "Supabase",                                 // who sends sign-in emails (change when you add Resend etc.)
  pdfWorkerHost: "",                                         // empty until the PDF worker is deployed; hides it from the Privacy Policy
  lastUpdated: "23 October 2026",
  refundWindowDays: 7,
  supportResponseHours: 48
} as const;

/** True for values that still need to be filled in. */
export function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}
