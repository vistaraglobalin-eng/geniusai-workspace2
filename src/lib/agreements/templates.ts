// Agreement Studio templates: the questions each agreement asks, plus India-specific notes.
// Shared by the form (client) and the API (server). The AI drafts from these answers.

export type FieldType = "text" | "textarea" | "date" | "number" | "money" | "select";
export type Field = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: readonly string[];
  defaultValue?: string;
  max?: number; // max characters (text) or value (number)
};

export type AgreementTemplate = {
  key: string;
  title: string;
  description: string;
  category: "Business" | "Property" | "People" | "Online" | "Planning";
  note?: string; // shown on the form: legal context worth knowing
  fields: readonly Field[];
  instructions: string; // what the AI must include
};

const JURISDICTION: Field = { key: "jurisdiction", label: "City for disputes (courts)", type: "text", placeholder: "e.g. Mumbai", required: true, max: 60 };
const EFFECTIVE: Field = { key: "effective_date", label: "Start / effective date", type: "date", required: true };

export const TEMPLATES: readonly AgreementTemplate[] = [
  {
    key: "nda",
    title: "Non-Disclosure Agreement (NDA)",
    description: "Protect confidential information you share with a partner, vendor or investor.",
    category: "Business",
    fields: [
      { key: "nda_type", label: "Type", type: "select", options: ["Mutual (both sides share)", "One-way (only one side shares)"], defaultValue: "Mutual (both sides share)", required: true },
      { key: "party_a", label: "First party (name)", type: "text", required: true, placeholder: "e.g. Acme Technologies Pvt Ltd", max: 120 },
      { key: "party_a_address", label: "First party address", type: "textarea", max: 300 },
      { key: "party_b", label: "Second party (name)", type: "text", required: true, max: 120 },
      { key: "party_b_address", label: "Second party address", type: "textarea", max: 300 },
      { key: "purpose", label: "Why information is being shared", type: "textarea", required: true, placeholder: "e.g. evaluating a software development partnership", max: 600 },
      { key: "years", label: "Confidentiality period (years)", type: "number", defaultValue: "2", max: 20 },
      EFFECTIVE, JURISDICTION
    ],
    instructions: "Draft a non-disclosure agreement. Define Confidential Information with standard exclusions, permitted use limited to the stated purpose, obligations of the receiving party, permitted disclosures (employees/advisers on need-to-know, legal compulsion with notice), return or destruction of information, no licence, term and survival, remedies including injunctive relief, governing law of India and the stated city's courts. For a one-way NDA, make the first party the Disclosing Party."
  },
  {
    key: "rental",
    title: "Rental agreement (leave & licence)",
    description: "For renting a flat or house: rent, deposit, lock-in and notice.",
    category: "Property",
    note: "Rental agreements in India usually need stamp duty (e-stamp paper) and, in some states such as Maharashtra, registration. 11-month terms are common. Check your state's rules before signing.",
    fields: [
      { key: "licensor", label: "Owner (licensor) name", type: "text", required: true, max: 120 },
      { key: "licensor_address", label: "Owner's address", type: "textarea", max: 300 },
      { key: "licensee", label: "Tenant (licensee) name", type: "text", required: true, max: 120 },
      { key: "licensee_address", label: "Tenant's permanent address", type: "textarea", max: 300 },
      { key: "property", label: "Property address and description", type: "textarea", required: true, placeholder: "e.g. Flat 402, 2BHK, Sunrise Apartments, Bandra West, Mumbai 400050", max: 400 },
      { key: "rent", label: "Monthly rent (₹)", type: "money", required: true },
      { key: "deposit", label: "Security deposit (₹)", type: "money", required: true },
      { key: "months", label: "Term (months)", type: "number", defaultValue: "11", max: 60 },
      EFFECTIVE,
      { key: "lock_in", label: "Lock-in period (months)", type: "number", defaultValue: "6", max: 36 },
      { key: "notice", label: "Notice period (months)", type: "number", defaultValue: "1", max: 6 },
      { key: "due_day", label: "Rent due by (day of month)", type: "number", defaultValue: "5", max: 28 },
      { key: "maintenance", label: "Society maintenance paid by", type: "select", options: ["Owner", "Tenant", "Included in rent"], defaultValue: "Owner" },
      { key: "escalation", label: "Rent increase on renewal (%)", type: "number", defaultValue: "5", max: 50 },
      { key: "furnishing", label: "Furniture and fittings provided", type: "textarea", placeholder: "e.g. 2 ACs, fridge, washing machine, wardrobes", max: 600 },
      JURISDICTION
    ],
    instructions: "Draft a leave and licence agreement under Indian law (not a lease creating tenancy rights). Cover: licence fee and due date, security deposit (interest-free, refundable on vacating after deductions for damage/dues), term and renewal with escalation, lock-in and early termination, notice period, permitted use (residential only), maintenance and utilities, repairs, no subletting, owner's right of inspection with notice, handover condition, police verification and society rules, list of fixtures as a schedule, stamp duty and registration responsibility (parties to bear as agreed, with a placeholder), governing law and courts of the stated city."
  },
  {
    key: "employment",
    title: "Employment agreement",
    description: "Role, salary (CTC), probation, notice period and confidentiality.",
    category: "People",
    note: "In India, restrictions that stop an employee working for competitors after they leave are generally unenforceable (Indian Contract Act, section 27). This template uses confidentiality and non-solicitation instead.",
    fields: [
      { key: "employer", label: "Employer (company) name", type: "text", required: true, max: 120 },
      { key: "employer_address", label: "Employer address", type: "textarea", max: 300 },
      { key: "employee", label: "Employee name", type: "text", required: true, max: 120 },
      { key: "designation", label: "Job title", type: "text", required: true, max: 80 },
      { key: "ctc", label: "Annual CTC (₹)", type: "money", required: true },
      EFFECTIVE,
      { key: "location", label: "Work location", type: "text", placeholder: "e.g. Pune / Remote", max: 80 },
      { key: "probation", label: "Probation (months)", type: "number", defaultValue: "6", max: 12 },
      { key: "notice", label: "Notice period (days)", type: "number", defaultValue: "30", max: 180 },
      { key: "hours", label: "Working days and hours", type: "text", defaultValue: "Monday to Friday, 9:30 am to 6:30 pm", max: 120 },
      { key: "benefits", label: "Leave and benefits", type: "textarea", placeholder: "e.g. 18 days paid leave, health insurance, PF as per law", max: 600 },
      JURISDICTION
    ],
    instructions: "Draft an employment agreement under Indian law: appointment and duties, commencement, probation and confirmation, remuneration (CTC with a placeholder salary breakup schedule), statutory benefits (PF/ESI/gratuity as applicable), working hours, leave, confidentiality, intellectual property assignment for work created in employment, data protection, code of conduct, non-solicitation of employees and clients for a reasonable period (no post-employment non-compete), termination and notice (including payment in lieu), return of property, full and final settlement, governing law and courts."
  },
  {
    key: "freelance",
    title: "Freelance / service agreement",
    description: "Scope, fees, milestones and who owns the work.",
    category: "Business",
    fields: [
      { key: "client", label: "Client name", type: "text", required: true, max: 120 },
      { key: "provider", label: "Service provider / freelancer name", type: "text", required: true, max: 120 },
      { key: "scope", label: "Work to be done", type: "textarea", required: true, placeholder: "e.g. design and build a 5-page website with a contact form", max: 1200 },
      { key: "fee", label: "Total fee (₹)", type: "money", required: true },
      { key: "schedule", label: "Payment schedule", type: "textarea", defaultValue: "50% advance, 50% on delivery", max: 400 },
      { key: "timeline", label: "Timeline / deadline", type: "text", placeholder: "e.g. 6 weeks from start", max: 120 },
      { key: "revisions", label: "Revisions included", type: "number", defaultValue: "2", max: 20 },
      { key: "ip", label: "Who owns the finished work", type: "select", options: ["Client, after full payment", "Service provider (client gets a licence)"], defaultValue: "Client, after full payment" },
      { key: "gst", label: "GST", type: "select", options: ["Fee is exclusive of GST", "Fee is inclusive of GST", "Provider not registered for GST"], defaultValue: "Fee is exclusive of GST" },
      EFFECTIVE, JURISDICTION
    ],
    instructions: "Draft a service agreement between an independent contractor and a client under Indian law: scope and deliverables (as a schedule), timeline, acceptance and revisions, fees, payment terms and late payment, GST and TDS treatment as stated, intellectual property per the chosen option, confidentiality, independent contractor status (no employment), warranties, limitation of liability, termination with payment for work done, dispute resolution, governing law and courts."
  },
  {
    key: "terms",
    title: "Website terms & conditions",
    description: "Terms of use for your website or app.",
    category: "Online",
    fields: [
      { key: "business", label: "Business name", type: "text", required: true, max: 120 },
      { key: "website", label: "Website or app name / URL", type: "text", required: true, max: 160 },
      { key: "offering", label: "What you offer", type: "textarea", required: true, max: 800 },
      { key: "accounts", label: "Do users create accounts?", type: "select", options: ["Yes", "No"], defaultValue: "Yes" },
      { key: "payments", label: "Do users pay on the site?", type: "select", options: ["Yes", "No"], defaultValue: "No" },
      { key: "email", label: "Contact email", type: "text", required: true, max: 120 },
      JURISDICTION
    ],
    instructions: "Draft website/app terms of use for an Indian business: acceptance, eligibility, accounts (if any), use of the service, prohibited conduct, user content, intellectual property, payments and refunds (if payments are taken, refer to a separate refund policy), third-party links, disclaimers, limitation of liability, indemnity, termination, compliance with the Information Technology Act 2000 and a grievance officer clause with placeholders, changes to terms, governing law and courts, contact."
  },
  {
    key: "partnership",
    title: "Partnership deed",
    description: "Set up a partnership firm: capital, profit sharing and duties.",
    category: "Business",
    note: "Partnership deeds are usually printed on stamp paper and can be registered with your state's Registrar of Firms.",
    fields: [
      { key: "firm", label: "Firm name", type: "text", required: true, max: 120 },
      { key: "business", label: "Nature of business", type: "textarea", required: true, max: 500 },
      { key: "place", label: "Principal place of business", type: "textarea", required: true, max: 300 },
      { key: "partners", label: "Partners (one per line: name, address, capital ₹, profit share %)", type: "textarea", required: true, placeholder: "Asha Rao, 12 MG Road Bengaluru, 500000, 50%\nRavi Kumar, 4 Park St Kolkata, 500000, 50%", max: 1500 },
      EFFECTIVE,
      { key: "banking", label: "Who can operate the bank account", type: "text", defaultValue: "Any two partners jointly", max: 160 },
      { key: "salary", label: "Partner remuneration / interest on capital", type: "textarea", placeholder: "e.g. as permitted under the Income Tax Act", max: 400 },
      JURISDICTION
    ],
    instructions: "Draft a partnership deed under the Indian Partnership Act, 1932: name, business, place, commencement and duration (at will unless stated), capital contributions, profit and loss sharing, remuneration and interest on capital (within Income Tax Act limits), books of account and audit, banking operations, duties and restrictions of partners, admission and retirement, death or insolvency, dissolution and settlement of accounts, arbitration of disputes, governing law and courts. Include a schedule listing partners with their details."
  },
  {
    key: "nonsolicit",
    title: "Non-solicitation & confidentiality agreement",
    description: "Stop someone poaching your clients or staff, and protect your information.",
    category: "People",
    note: "Used instead of a non-compete: in India, broad restrictions on working for competitors after a relationship ends are generally unenforceable (Indian Contract Act, section 27). Reasonable non-solicitation and confidentiality terms are more likely to hold.",
    fields: [
      { key: "company", label: "Company name", type: "text", required: true, max: 120 },
      { key: "individual", label: "Person or firm agreeing", type: "text", required: true, max: 120 },
      { key: "relationship", label: "Relationship", type: "select", options: ["Employee", "Consultant", "Business partner", "Vendor"], defaultValue: "Employee" },
      { key: "months", label: "Non-solicitation period after it ends (months)", type: "number", defaultValue: "12", max: 24 },
      EFFECTIVE, JURISDICTION
    ],
    instructions: "Draft a confidentiality and non-solicitation agreement under Indian law: confidential information and obligations, non-solicitation of employees and clients during the relationship and for the stated period after (reasonable, no restraint on general employment or trade), return of information, remedies, severability, governing law and courts. Add a short clause confirming nothing restrains the person from practising their profession generally."
  },
  {
    key: "business_plan",
    title: "Business plan",
    description: "A structured plan for investors, banks or your own roadmap.",
    category: "Planning",
    fields: [
      { key: "business", label: "Business name", type: "text", required: true, max: 120 },
      { key: "idea", label: "What the business does", type: "textarea", required: true, max: 1200 },
      { key: "customers", label: "Target customers", type: "textarea", required: true, max: 600 },
      { key: "location", label: "Where you operate", type: "text", max: 120 },
      { key: "costs", label: "Start-up costs (₹) and what they cover", type: "textarea", max: 800 },
      { key: "revenue", label: "How you make money (pricing)", type: "textarea", required: true, max: 800 },
      { key: "team", label: "Founders and team", type: "textarea", max: 800 },
      { key: "funding", label: "Funding needed (₹), if any", type: "text", max: 120 }
    ],
    instructions: "Write a concise business plan: executive summary, problem and solution, target market and size (state assumptions; don't invent statistics, mark figures to verify), competition, business model and pricing, go-to-market plan, operations, team, a simple 3-year financial outline using only the given numbers and clearly labelled assumptions, funding ask and use of funds, key risks and mitigations, milestones. Use tables where helpful."
  }
];

export const CUSTOM_TEMPLATE_KEY = "custom";

export function getTemplate(key: string): AgreementTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key);
}

export type FieldValues = Record<string, string>;

/** Validates and cleans form answers against a template. Returns errors per field. */
export function validateFields(template: AgreementTemplate, input: unknown): { values: FieldValues; errors: Record<string, string> } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const values: FieldValues = {};
  const errors: Record<string, string> = {};
  for (const f of template.fields) {
    let v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim() : "";
    if (!v && f.defaultValue) v = f.defaultValue;
    if (f.required && !v) { errors[f.key] = `${f.label} is required.`; continue; }
    if (!v) continue;
    if (f.type === "number" || f.type === "money") {
      const n = Number(v.replace(/[,₹\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) { errors[f.key] = `${f.label} must be a number.`; continue; }
      if (f.type === "number" && f.max !== undefined && n > f.max) { errors[f.key] = `${f.label} can be at most ${f.max}.`; continue; }
      if (f.type === "money" && n > 1e12) { errors[f.key] = `${f.label} is too large.`; continue; }
      v = f.type === "money" ? `₹${n.toLocaleString("en-IN")}` : String(n);
    } else if (f.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) { errors[f.key] = `${f.label} must be a date.`; continue; }
      v = new Date(`${v}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    } else if (f.type === "select") {
      if (f.options && !f.options.includes(v)) { errors[f.key] = `Choose a valid option for ${f.label}.`; continue; }
    } else {
      const max = f.max ?? 500;
      if (v.length > max) { errors[f.key] = `${f.label} can be up to ${max} characters.`; continue; }
    }
    values[f.key] = v;
  }
  return { values, errors };
}

export function suggestTitle(template: AgreementTemplate | undefined, values: FieldValues, prompt?: string): string {
  if (!template) return (prompt ?? "Custom document").replace(/\s+/g, " ").slice(0, 80) || "Custom document";
  const who = values.party_b || values.licensee || values.employee || values.client || values.individual || values.firm || values.business || values.website;
  return `${template.title}${who ? ` – ${who}` : ""}`.slice(0, 160);
}
