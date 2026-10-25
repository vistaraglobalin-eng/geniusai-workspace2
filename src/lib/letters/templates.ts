// Business letter templates. Each template has a short form; its text is generated from the form and
// can then be edited freely before making the PDF / Word file.

import { amountInWords, inr, showDate, todayIso } from "@/lib/invoices/calc";
import type { InvoiceSettings } from "@/lib/invoices/render";
import type { Block, LetterheadStyle } from "./render";

export type FieldType = "text" | "date" | "money" | "number" | "textarea" | "select" | "month";
export type Field = { key: string; label: string; type?: FieldType; placeholder?: string; options?: string[]; half?: boolean; required?: boolean; group?: string };
export type Values = Record<string, string>;
export type TemplateKey =
  | "offer" | "appointment" | "experience" | "relieving" | "salary_slip" | "increment" | "noc" | "rent_receipt" | "authorization" | "custom"
  | "employment_cert" | "internship" | "warning" | "resignation" | "leave" | "bank_request" | "self_declaration" | "payment_demand";

export type Template = {
  key: TemplateKey; label: string; note: string; color: string; category: "Staff" | "Business" | "Personal";
  fields: Field[];
  defaults?: (s: InvoiceSettings) => Values;
  /** Editable main text. Empty string = no free text for this template. */
  body: (v: Values, s: InvoiceSettings) => string;
  blocks: (v: Values, s: InvoiceSettings, body: string) => Block[];
  fileName: (v: Values) => string;
  letterhead?: LetterheadStyle | null; // suggested style (null = plain paper)
};

const n = (x: string | undefined) => { const v = Number(String(x ?? "").replace(/[,₹\s]/g, "")); return Number.isFinite(v) ? v : 0; };
const rs = (x: number) => `₹${inr(x, Number.isInteger(x) ? 0 : 2)}`;
/** "₹3,60,000 (Rupees … Only)", or a blank to fill in when no amount is entered yet. */
const money = (x: number) => (x > 0 ? `${rs(x)} (${amountInWords(x)})` : "₹__________");
const d = (iso: string | undefined) => (iso ? showDate(iso) : "__________");
const or = (x: string | undefined, blank = "__________") => (x && x.trim() ? x.trim() : blank);
const monthName = (ym: string | undefined) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "__________";
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(ym + "-01T00:00:00Z"));
};
const salute = (g: string | undefined) => (g === "Ms." ? "Ms." : g === "Mr." ? "Mr." : g === "Dr." ? "Dr." : "");
const person = (v: Values) => [salute(v.title), or(v.name, "")].filter(Boolean).join(" ").trim() || "__________";
const pron = (v: Values) => (v.title === "Ms." ? { he: "she", his: "her", him: "her" } : v.title === "Mr." ? { he: "he", his: "his", him: "him" } : { he: "they", his: "their", him: "them" });
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const signer = (s: InvoiceSettings, v: Values) => ({ label: `For ${s.business_name || "the company"}`, name: or(v.signatory, "Authorised Signatory"), sub: v.signatory_title || (v.signatory ? "Authorised Signatory" : undefined), image: true });
const refDate = (v: Values) => [v.ref ? `Ref: ${v.ref}` : "", `Date: ${d(v.date)}`].filter(Boolean);
const toBlock = (v: Values): Block => ({ t: "meta", left: ["To,", person(v), ...(v.address ? v.address.split("\n") : [])].filter(Boolean), right: refDate(v) });

const EMPLOYEE: Field[] = [
  { key: "title", label: "Title", type: "select", options: ["", "Mr.", "Ms.", "Dr."], half: true, group: "Employee" },
  { key: "name", label: "Full name", required: true, half: true, group: "Employee" },
  { key: "designation", label: "Designation", placeholder: "Sales Executive", half: true, required: true, group: "Employee" },
  { key: "department", label: "Department", placeholder: "Sales", half: true, group: "Employee" }
];
const LETTER: Field[] = [
  { key: "date", label: "Letter date", type: "date", half: true, group: "Letter" },
  { key: "ref", label: "Reference no. (optional)", placeholder: "HR/2026/014", half: true, group: "Letter" }
];
const SIGN: Field[] = [
  { key: "signatory", label: "Signed by", placeholder: "Vanish Kumar", half: true, group: "Signed by" },
  { key: "signatory_title", label: "Their designation", placeholder: "Director", half: true, group: "Signed by" }
];
const today = () => ({ date: todayIso(), title: "" });

export const TEMPLATES: Template[] = [
  {
    key: "offer", label: "Offer letter", note: "Job offer with salary and joining date", color: "indigo", category: "Staff",
    fields: [...EMPLOYEE, { key: "address", label: "Address", type: "textarea", group: "Employee" },
      { key: "joining", label: "Joining date", type: "date", half: true, group: "Job" }, { key: "ctc", label: "Salary (CTC) per year ₹", type: "money", half: true, required: true, group: "Job" },
      { key: "location", label: "Work location", half: true, group: "Job" }, { key: "probation", label: "Probation (months)", type: "number", half: true, group: "Job" },
      { key: "reporting", label: "Reports to", half: true, group: "Job" }, { key: "accept_by", label: "Accept by", type: "date", half: true, group: "Job" },
      ...LETTER, ...SIGN],
    defaults: () => ({ ...today(), probation: "6" }),
    body: (v, s) => {
      const ctc = n(v.ctc), co = s.business_name || "our company";
      return [`Dear ${person(v)},`,
        `We are pleased to offer you the position of ${or(v.designation)}${v.department ? ` in the ${v.department} department` : ""} at ${co}. We were impressed by your experience and believe you will be a valuable member of our team.`,
        `Your annual cost to company (CTC) will be ${money(ctc)}${ctc > 0 ? `, which works out to about ${rs(Math.round(ctc / 12))} per month` : ""}. A detailed salary break-up will be shared with your appointment letter.`,
        `Your date of joining will be ${d(v.joining)}${v.location ? ` and your place of work will be ${v.location}` : ""}.${v.reporting ? ` You will report to ${v.reporting}.` : ""}${n(v.probation) ? ` You will be on probation for ${n(v.probation)} months from the date of joining.` : ""}`,
        `This offer is subject to verification of your documents and references. Please bring originals of your educational certificates, ID proof (Aadhaar/PAN), previous employment documents and two passport-size photographs on the day of joining.`,
        `Please sign and return a copy of this letter${v.accept_by ? ` by ${d(v.accept_by)}` : ""} to confirm your acceptance. We look forward to welcoming you.`
      ].join("\n\n");
    },
    blocks: (v, s, body) => [toBlock(v), { t: "subject", text: `Offer of employment – ${or(v.designation)}` }, { t: "p", text: body }, { t: "p", text: "Yours sincerely," , align: "left" },
      { t: "sign", right: signer(s, v), left: { label: "Accepted by", name: person(v), sub: "Signature & date" } }],
    fileName: (v) => `Offer letter - ${or(v.name, "employee")}`
  },
  {
    key: "appointment", label: "Appointment letter", note: "Terms of employment and salary break-up", color: "blue", category: "Staff",
    fields: [...EMPLOYEE, { key: "address", label: "Address", type: "textarea", group: "Employee" }, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" },
      { key: "joining", label: "Joining date", type: "date", half: true, group: "Job" }, { key: "location", label: "Work location", half: true, group: "Job" },
      { key: "probation", label: "Probation (months)", type: "number", half: true, group: "Job" }, { key: "notice", label: "Notice period (days)", type: "number", half: true, group: "Job" },
      { key: "hours", label: "Working hours", placeholder: "10:00 am – 6:30 pm, Monday to Saturday", group: "Job" },
      { key: "basic", label: "Basic / month ₹", type: "money", half: true, group: "Monthly salary" }, { key: "hra", label: "HRA / month ₹", type: "money", half: true, group: "Monthly salary" },
      { key: "allow", label: "Other allowances / month ₹", type: "money", half: true, group: "Monthly salary" }, { key: "pf", label: "Employer PF / month ₹", type: "money", half: true, group: "Monthly salary" },
      ...LETTER, ...SIGN],
    defaults: () => ({ ...today(), probation: "6", notice: "30", hours: "10:00 am – 6:30 pm, Monday to Saturday" }),
    body: (v, s) => {
      const co = s.business_name || "the company";
      return [`Dear ${person(v)},`,
        `With reference to your application and the subsequent interview, we are pleased to appoint you as ${or(v.designation)}${v.department ? ` in the ${v.department} department` : ""} of ${co} on the following terms and conditions:`,
        `1. Date of joining: ${d(v.joining)}.${v.emp_id ? ` Your employee ID is ${v.emp_id}.` : ""}`,
        `2. Place of work: ${or(v.location, "our office")}. You may be transferred to any other office or department as business needs require.`,
        `3. Probation: You will be on probation for ${n(v.probation) || 6} months. On satisfactory completion, your services will be confirmed in writing.`,
        `4. Working hours: ${or(v.hours)}. You are entitled to leave and holidays as per company policy.`,
        `5. Salary: Your monthly salary break-up is given below. Salary is paid by bank transfer and is subject to deduction of applicable taxes, PF, ESI and professional tax.`,
        `6. Notice period: Either party may end this employment by giving ${n(v.notice) || 30} days' notice in writing, or salary in lieu of notice.`,
        `7. Confidentiality: You will keep all business information, customer data and trade secrets of the company confidential during and after your employment.`,
        `Please sign the duplicate copy of this letter as a token of your acceptance.`
      ].join("\n\n");
    },
    blocks: (v, s, body) => {
      const rows: string[][] = [["Basic", n(v.basic)], ["House rent allowance (HRA)", n(v.hra)], ["Other allowances", n(v.allow)]].filter((r) => (r[1] as number) > 0).map((r) => [r[0] as string, rs(r[1] as number), rs((r[1] as number) * 12)]);
      const gross = n(v.basic) + n(v.hra) + n(v.allow);
      if (gross > 0) rows.push(["Gross salary", rs(gross), rs(gross * 12)]);
      if (n(v.pf) > 0) rows.push(["Employer PF contribution", rs(n(v.pf)), rs(n(v.pf) * 12)]);
      if (gross > 0) rows.push(["Cost to company (CTC)", rs(gross + n(v.pf)), rs((gross + n(v.pf)) * 12)]);
      const at = body.indexOf("6. Notice period");
      const [b1, b2] = at > 0 ? [body.slice(0, at), body.slice(at)] : [body, ""];
      return [toBlock(v), { t: "subject", text: `Letter of appointment – ${or(v.designation)}` }, { t: "p", text: b1 },
        ...(rows.length ? [{ t: "table", head: ["Component", "Monthly", "Yearly"], rows, widths: [52, 24, 24], align: ["left", "right", "right"], boldRows: rows.map((r, i) => (r[0].startsWith("Gross") || r[0].startsWith("Cost") ? i : -1)).filter((i) => i >= 0) } as Block] : []),
        ...(b2 ? [{ t: "p", text: b2 } as Block] : []), { t: "p", text: "Yours sincerely,", align: "left" },
        { t: "sign", right: signer(s, v), left: { label: "Accepted by", name: person(v), sub: "Signature & date" } }];
    },
    fileName: (v) => `Appointment letter - ${or(v.name, "employee")}`
  },
  {
    key: "experience", label: "Experience certificate", note: "Confirms the period and role of a former employee", color: "green", category: "Staff",
    fields: [...EMPLOYEE, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" },
      { key: "from", label: "Worked from", type: "date", half: true, group: "Service" }, { key: "to", label: "Worked till", type: "date", half: true, group: "Service" },
      { key: "duties", label: "Main responsibilities (optional)", type: "textarea", placeholder: "Handling customer orders, billing and dispatch", group: "Service" },
      ...LETTER, ...SIGN],
    defaults: () => today(),
    body: (v, s) => {
      const p = pron(v);
      return [`This is to certify that ${person(v)}${v.emp_id ? ` (Employee ID: ${v.emp_id})` : ""} was employed with ${s.business_name || "our organisation"} from ${d(v.from)} to ${d(v.to)}. At the time of leaving, ${p.he} held the position of ${or(v.designation)}${v.department ? ` in the ${v.department} department` : ""}.`,
        ...(v.duties ? [`During this period, ${p.his} responsibilities included ${v.duties.trim().replace(/\.$/, "")}.`] : []),
        `${cap(p.his)} conduct and performance during ${p.his} tenure were found to be good. We wish ${p.him} every success in ${p.his} future endeavours.`
      ].join("\n\n");
    },
    blocks: (v, s, body) => [{ t: "meta", left: [], right: refDate(v) }, { t: "title", text: "Experience Certificate" }, { t: "p", text: "To whom it may concern", bold: true, align: "left" }, { t: "p", text: body }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Experience certificate - ${or(v.name, "employee")}`
  },
  {
    key: "relieving", label: "Relieving letter", note: "Confirms resignation accepted and dues cleared", color: "teal", category: "Staff",
    fields: [...EMPLOYEE, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" }, { key: "address", label: "Address", type: "textarea", group: "Employee" },
      { key: "joining", label: "Date of joining", type: "date", half: true, group: "Service" }, { key: "resigned", label: "Resignation date", type: "date", half: true, group: "Service" },
      { key: "last_day", label: "Last working day", type: "date", half: true, group: "Service" }, ...LETTER, ...SIGN],
    defaults: () => today(),
    body: (v, s) => [`Dear ${person(v)},`,
      `This has reference to your resignation letter dated ${d(v.resigned)}. We wish to inform you that your resignation has been accepted and you are relieved from your duties as ${or(v.designation)} with ${s.business_name || "the company"} with effect from the close of working hours on ${d(v.last_day)}.`,
      `We confirm that you worked with us from ${d(v.joining)} to ${d(v.last_day)} and that your full and final settlement has been completed. You are reminded of your continuing obligation to keep the company's confidential information confidential.`,
      `We thank you for your contribution and wish you the very best for your future.`].join("\n\n"),
    blocks: (v, s, body) => [toBlock(v), { t: "subject", text: "Relieving letter" }, { t: "p", text: body }, { t: "p", text: "Yours sincerely,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Relieving letter - ${or(v.name, "employee")}`
  },
  {
    key: "salary_slip", label: "Salary slip", note: "Monthly pay slip with earnings and deductions", color: "orange", category: "Staff",
    fields: [{ key: "month", label: "Salary month", type: "month", half: true, required: true, group: "Pay period" }, { key: "paid_days", label: "Paid days", type: "number", half: true, group: "Pay period" },
      { key: "title", label: "Title", type: "select", options: ["", "Mr.", "Ms.", "Dr."], half: true, group: "Employee" }, { key: "name", label: "Employee name", half: true, required: true, group: "Employee" },
      { key: "emp_id", label: "Employee ID", half: true, group: "Employee" }, { key: "designation", label: "Designation", half: true, group: "Employee" },
      { key: "pan", label: "PAN", half: true, group: "Employee" }, { key: "uan", label: "UAN (PF)", half: true, group: "Employee" },
      { key: "bank", label: "Bank A/c (last 4 digits)", half: true, group: "Employee" }, { key: "joining", label: "Date of joining", type: "date", half: true, group: "Employee" },
      { key: "basic", label: "Basic ₹", type: "money", half: true, group: "Earnings" }, { key: "hra", label: "HRA ₹", type: "money", half: true, group: "Earnings" },
      { key: "conv", label: "Conveyance ₹", type: "money", half: true, group: "Earnings" }, { key: "special", label: "Special allowance ₹", type: "money", half: true, group: "Earnings" },
      { key: "bonus", label: "Bonus / incentive ₹", type: "money", half: true, group: "Earnings" }, { key: "ot", label: "Overtime ₹", type: "money", half: true, group: "Earnings" },
      { key: "pf", label: "Employee PF ₹", type: "money", half: true, group: "Deductions" }, { key: "esi", label: "ESI ₹", type: "money", half: true, group: "Deductions" },
      { key: "ptax", label: "Professional tax ₹", type: "money", half: true, group: "Deductions" }, { key: "tds", label: "TDS (income tax) ₹", type: "money", half: true, group: "Deductions" },
      { key: "advance", label: "Advance / loan ₹", type: "money", half: true, group: "Deductions" }, { key: "lop", label: "Loss of pay ₹", type: "money", half: true, group: "Deductions" },
      ...SIGN],
    defaults: () => { const t = todayIso(); const m = new Date(t + "T00:00:00Z"); m.setUTCMonth(m.getUTCMonth() - 1); return { title: "", month: m.toISOString().slice(0, 7), date: t }; },
    body: () => "",
    blocks: (v, s) => {
      const E: [string, number][] = [["Basic", n(v.basic)], ["HRA", n(v.hra)], ["Conveyance", n(v.conv)], ["Special allowance", n(v.special)], ["Bonus / incentive", n(v.bonus)], ["Overtime", n(v.ot)]];
      const D: [string, number][] = [["Provident fund", n(v.pf)], ["ESI", n(v.esi)], ["Professional tax", n(v.ptax)], ["TDS", n(v.tds)], ["Advance / loan", n(v.advance)], ["Loss of pay", n(v.lop)]];
      const e = E.filter((x) => x[1] > 0), dd = D.filter((x) => x[1] > 0);
      const rows: string[][] = [];
      for (let i = 0; i < Math.max(e.length, dd.length, 1); i++) rows.push([e[i]?.[0] ?? "", e[i] ? rs(e[i][1]) : "", dd[i]?.[0] ?? "", dd[i] ? rs(dd[i][1]) : ""]);
      const ge = e.reduce((a, x) => a + x[1], 0), gd = dd.reduce((a, x) => a + x[1], 0), net = ge - gd;
      rows.push(["Gross earnings", rs(ge), "Total deductions", rs(gd)]);
      return [
        { t: "title", text: `Salary slip – ${monthName(v.month)}` },
        { t: "table", rows: [["Employee name", person(v), "Employee ID", or(v.emp_id, "—")], ["Designation", or(v.designation, "—"), "Date of joining", v.joining ? d(v.joining) : "—"],
          ["PAN", or(v.pan, "—"), "UAN", or(v.uan, "—")], ["Bank A/c", v.bank ? `XXXX${v.bank.slice(-4)}` : "—", "Paid days", or(v.paid_days, "—")]], widths: [22, 28, 22, 28] },
        { t: "table", head: ["Earnings", "Amount", "Deductions", "Amount"], rows, widths: [30, 20, 30, 20], align: ["left", "right", "left", "right"], boldRows: [rows.length - 1] },
        { t: "table", rows: [["Net pay", rs(net)]], widths: [50, 50], align: ["left", "right"], boldRows: [0] },
        { t: "p", text: `Net pay in words: ${amountInWords(net)}`, align: "left", bold: true, size: 20 },
        { t: "note", text: "This is a computer-generated salary slip." },
        { t: "sign", right: signer(s, v) }
      ];
    },
    fileName: (v) => `Salary slip ${v.month ?? ""} - ${or(v.name, "employee")}`
  },
  {
    key: "increment", label: "Increment letter", note: "Salary revision with new CTC and date", color: "purple", category: "Staff",
    fields: [...EMPLOYEE, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" },
      { key: "old_ctc", label: "Current CTC / year ₹", type: "money", half: true, group: "Revision" }, { key: "new_ctc", label: "New CTC / year ₹", type: "money", half: true, required: true, group: "Revision" },
      { key: "effective", label: "Effective from", type: "date", half: true, group: "Revision" }, { key: "new_designation", label: "New designation (if promoted)", half: true, group: "Revision" },
      ...LETTER, ...SIGN],
    defaults: () => today(),
    body: (v, s) => {
      const oldC = n(v.old_ctc), newC = n(v.new_ctc), pct = oldC > 0 ? ((newC - oldC) / oldC) * 100 : 0;
      return [`Dear ${person(v)},`,
        `In recognition of your contribution and performance, we are pleased to inform you that your annual cost to company (CTC) has been revised to ${money(newC)}${oldC > 0 ? `, an increase of ${pct.toFixed(1)}% over your current CTC of ${rs(oldC)}` : ""}, with effect from ${d(v.effective)}.`,
        ...(v.new_designation ? [`We are also pleased to promote you to the position of ${v.new_designation}.`] : []),
        `All other terms and conditions of your employment remain unchanged. Please keep your salary details confidential.`,
        `We appreciate your efforts and look forward to your continued contribution to ${s.business_name || "the company"}.`].join("\n\n");
    },
    blocks: (v, s, body) => [toBlock(v), { t: "subject", text: v.new_designation ? "Promotion and salary revision" : "Salary revision" }, { t: "p", text: body }, { t: "p", text: "Yours sincerely,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Increment letter - ${or(v.name, "employee")}`
  },
  {
    key: "noc", label: "NOC", note: "No objection certificate for an employee", color: "cyan", category: "Staff",
    fields: [...EMPLOYEE, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" }, { key: "joining", label: "Working since", type: "date", half: true, group: "Employee" },
      { key: "purpose", label: "Purpose", type: "select", options: ["passport application", "visa and foreign travel", "higher studies", "a bank loan", "other"], group: "Purpose" },
      { key: "purpose_other", label: "Details", placeholder: "e.g. travel to Dubai from 1 to 10 Dec 2026", group: "Purpose" }, ...LETTER, ...SIGN],
    defaults: () => ({ ...today(), purpose: "passport application" }),
    body: (v, s) => {
      const p = pron(v);
      const purpose = v.purpose === "other" ? or(v.purpose_other) : `${v.purpose ?? ""}${v.purpose_other ? ` (${v.purpose_other})` : ""}`;
      return [`This is to certify that ${person(v)}${v.emp_id ? ` (Employee ID: ${v.emp_id})` : ""} is working with ${s.business_name || "our organisation"} as ${or(v.designation)}${v.joining ? ` since ${d(v.joining)}` : ""}.`,
        `We have no objection to ${p.him} applying for ${purpose}. The organisation will not be responsible for any financial or legal liability arising from it.`,
        `This certificate is issued at ${p.his} request.`].join("\n\n");
    },
    blocks: (v, s, body) => [{ t: "meta", left: [], right: refDate(v) }, { t: "title", text: "No Objection Certificate" }, { t: "p", text: "To whom it may concern", bold: true, align: "left" }, { t: "p", text: body }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `NOC - ${or(v.name, "employee")}`
  },
  {
    key: "rent_receipt", label: "Rent receipt", note: "For HRA claims; with revenue stamp box", color: "pink", category: "Personal", letterhead: "none",
    fields: [{ key: "tenant", label: "Tenant name", half: true, required: true, group: "Rent" }, { key: "landlord", label: "Landlord name", half: true, required: true, group: "Rent" },
      { key: "property", label: "Rented property address", type: "textarea", group: "Rent" },
      { key: "rent", label: "Rent per month ₹", type: "money", half: true, required: true, group: "Rent" }, { key: "mode", label: "Paid by", type: "select", options: ["UPI", "Bank transfer", "Cash", "Cheque"], half: true, group: "Rent" },
      { key: "from", label: "From month", type: "month", half: true, group: "Period" }, { key: "to", label: "To month", type: "month", half: true, group: "Period" },
      { key: "landlord_pan", label: "Landlord PAN (needed if rent is over ₹1 lakh a year)", group: "Period" }, { key: "date", label: "Receipt date", type: "date", half: true, group: "Period" },
      { key: "separate", label: "Receipts", type: "select", options: ["One receipt per month", "One receipt for the whole period"], half: true, group: "Period" }],
    defaults: () => { const t = todayIso(); return { date: t, from: t.slice(0, 7), to: t.slice(0, 7), mode: "UPI", separate: "One receipt per month" }; },
    body: () => "",
    blocks: (v) => {
      const months = monthsBetween(v.from, v.to);
      const per = v.separate !== "One receipt for the whole period";
      const groups = per ? months.map((m) => [m]) : [months];
      const rent = n(v.rent);
      const out: Block[] = [];
      groups.forEach((g, i) => {
        const amt = rent * Math.max(1, g.length);
        const period = g.length > 1 ? `${monthName(g[0])} to ${monthName(g[g.length - 1])}` : monthName(g[0]);
        if (i > 0) out.push({ t: "space", h: 40 });
        out.push({ t: "title", text: "Rent receipt" },
          { t: "meta", left: [`Receipt no.: ${String(i + 1).padStart(2, "0")}`], right: [`Date: ${d(v.date)}`] },
          { t: "p", text: `Received with thanks from ${or(v.tenant)} a sum of ${money(amt)} by ${v.mode || "UPI"} towards rent for the property at ${or(v.property).replace(/\n/g, ", ")} for the period ${period}.` },
          { t: "sign", right: { label: "Landlord", name: or(v.landlord), sub: v.landlord_pan ? `PAN: ${v.landlord_pan.toUpperCase()}` : undefined }, stampBox: v.mode === "Cash" && amt > 5000 ? "Revenue stamp" : undefined });
      });
      return out;
    },
    fileName: (v) => `Rent receipts - ${or(v.tenant, "tenant")}`
  },
  {
    key: "authorization", label: "Authorisation letter", note: "Let someone act for your business", color: "yellow", category: "Business",
    fields: [{ key: "title", label: "Title", type: "select", options: ["", "Mr.", "Ms.", "Dr."], half: true, group: "Authorised person" }, { key: "name", label: "Name", half: true, required: true, group: "Authorised person" },
      { key: "designation", label: "Their role / relation", placeholder: "Accounts Manager", half: true, group: "Authorised person" }, { key: "id_proof", label: "ID proof", placeholder: "Aadhaar XXXX 1234", half: true, group: "Authorised person" },
      { key: "to_whom", label: "Addressed to", type: "textarea", placeholder: "The Branch Manager\nState Bank of India, Mansa", group: "Details" },
      { key: "task", label: "Authorised to", type: "textarea", placeholder: "collect the cheque book for our current account no. XXXX4321", required: true, group: "Details" },
      { key: "valid", label: "Valid till (optional)", type: "date", half: true, group: "Details" }, ...LETTER, ...SIGN],
    defaults: () => today(),
    body: (v, s) => [`Dear Sir/Madam,`,
      `I, the undersigned, on behalf of ${s.business_name || "our business"}, hereby authorise ${person(v)}${v.designation ? `, ${v.designation}` : ""}${v.id_proof ? ` (${v.id_proof})` : ""}, to ${or(v.task).replace(/\.$/, "")} on our behalf${v.valid ? `. This authorisation is valid till ${d(v.valid)}` : ""}.`,
      `Kindly extend your cooperation. The specimen signature of the authorised person is given below.`,
      `Specimen signature: ______________________`].join("\n\n"),
    blocks: (v, s, body) => [{ t: "meta", left: ["To,", ...(v.to_whom ? v.to_whom.split("\n") : ["__________"])], right: refDate(v) }, { t: "subject", text: "Letter of authorisation" }, { t: "p", text: body }, { t: "p", text: "Yours faithfully,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Authorisation letter - ${or(v.name, "")}`
  },
  {
    key: "employment_cert", label: "Employment certificate", note: "Proof of current job and salary for banks, visas, rent", color: "blue", category: "Staff",
    fields: [...EMPLOYEE, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" }, { key: "joining", label: "Working since", type: "date", half: true, required: true, group: "Employee" },
      { key: "ctc", label: "Annual salary (CTC) ₹ — leave blank to hide", type: "money", group: "Details" },
      { key: "purpose", label: "Purpose (optional)", placeholder: "e.g. opening a bank account", group: "Details" }, ...LETTER, ...SIGN],
    defaults: () => today(),
    body: (v, s) => {
      const p = pron(v);
      return [`This is to certify that ${person(v)}${v.emp_id ? ` (Employee ID: ${v.emp_id})` : ""} is working with ${s.business_name || "our organisation"} as ${or(v.designation)}${v.department ? ` in the ${v.department} department` : ""} since ${d(v.joining)}, and is presently in our employment.`,
        ...(n(v.ctc) > 0 ? [`${cap(p.his)} current annual salary (cost to company) is ${money(n(v.ctc))}.`] : []),
        `This certificate is issued at ${p.his} request${v.purpose ? ` for ${v.purpose.replace(/\.$/, "")}` : ""}.`].join("\n\n");
    },
    blocks: (v, s, body) => [{ t: "meta", left: [], right: refDate(v) }, { t: "title", text: "Employment Certificate" }, { t: "p", text: "To whom it may concern", bold: true, align: "left" }, { t: "p", text: body }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Employment certificate - ${or(v.name, "employee")}`
  },
  {
    key: "internship", label: "Internship certificate", note: "For interns: period, project and conduct", color: "purple", category: "Staff",
    fields: [{ key: "title", label: "Title", type: "select", options: ["", "Mr.", "Ms.", "Dr."], half: true, group: "Intern" }, { key: "name", label: "Full name", required: true, half: true, group: "Intern" },
      { key: "college", label: "College / university", half: true, group: "Intern" }, { key: "department", label: "Team / department", half: true, group: "Intern" },
      { key: "from", label: "From", type: "date", half: true, required: true, group: "Internship" }, { key: "to", label: "To", type: "date", half: true, required: true, group: "Internship" },
      { key: "project", label: "Worked on", type: "textarea", placeholder: "e.g. social media marketing and customer research for our new product line", group: "Internship" },
      { key: "conduct", label: "Performance", type: "select", options: ["excellent", "very good", "good", "satisfactory"], half: true, group: "Internship" }, ...LETTER, ...SIGN],
    defaults: () => ({ ...today(), conduct: "very good" }),
    body: (v, s) => {
      const p = pron(v);
      return [`This is to certify that ${person(v)}${v.college ? `, a student of ${v.college},` : ""} has successfully completed an internship with ${s.business_name || "our organisation"}${v.department ? ` in the ${v.department} team` : ""} from ${d(v.from)} to ${d(v.to)}.`,
        ...(v.project ? [`During the internship, ${p.he} worked on ${v.project.replace(/\.$/, "")}.`] : []),
        `${cap(p.his)} performance was ${v.conduct || "good"} and ${p.he} showed sincerity, a willingness to learn and good conduct throughout. We wish ${p.him} every success in the future.`].join("\n\n");
    },
    blocks: (v, s, body) => [{ t: "meta", left: [], right: refDate(v) }, { t: "title", text: "Internship Certificate" }, { t: "p", text: "To whom it may concern", bold: true, align: "left" }, { t: "p", text: body }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Internship certificate - ${or(v.name, "intern")}`
  },
  {
    key: "warning", label: "Warning letter", note: "Formal warning for attendance or conduct", color: "red", category: "Staff",
    fields: [...EMPLOYEE, { key: "emp_id", label: "Employee ID", half: true, group: "Employee" },
      { key: "issue", label: "Reason", type: "select", options: ["late coming and attendance", "absence without leave", "misconduct at the workplace", "poor performance", "violation of company policy"], half: true, group: "Details" },
      { key: "details", label: "What happened (dates, facts)", type: "textarea", placeholder: "e.g. You reported late on 6, 9 and 14 October 2026 without informing your manager.", required: true, group: "Details" },
      { key: "reply_days", label: "Reply within (days)", type: "number", half: true, group: "Details" }, ...LETTER, ...SIGN],
    defaults: () => ({ ...today(), issue: "late coming and attendance", reply_days: "3" }),
    body: (v, s) => [`Dear ${person(v)},`,
      `This letter is a formal warning regarding ${v.issue || "your conduct"}. ${or(v.details).replace(/\s*$/, "")}`,
      `This is not in line with the rules and standards expected of employees of ${s.business_name || "the company"}. You are advised to correct this immediately. Any repetition may lead to stricter disciplinary action, which may include termination of employment.`,
      `Please submit your written explanation within ${n(v.reply_days) || 3} days of receiving this letter.`].join("\n\n"),
    blocks: (v, s, body) => [toBlock(v), { t: "subject", text: `Warning letter — ${v.issue || "conduct"}` }, { t: "p", text: body }, { t: "p", text: "Yours sincerely,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Warning letter - ${or(v.name, "employee")}`
  },
  {
    key: "resignation", label: "Resignation letter", note: "Resign politely with your last working day", color: "teal", category: "Personal", letterhead: "none",
    fields: [{ key: "from_name", label: "Your name", required: true, half: true, group: "You" }, { key: "from_role", label: "Your designation", half: true, group: "You" },
      { key: "manager", label: "Addressed to", placeholder: "Mr. Rajesh Mehta, HR Manager", half: true, group: "Company" }, { key: "company", label: "Company name", required: true, half: true, group: "Company" },
      { key: "last_day", label: "Last working day", type: "date", half: true, required: true, group: "Details" }, { key: "notice", label: "Notice period (days)", type: "number", half: true, group: "Details" },
      { key: "reason", label: "Reason (optional)", placeholder: "e.g. to pursue higher studies", group: "Details" }, { key: "date", label: "Letter date", type: "date", half: true, group: "Details" }],
    defaults: () => ({ date: todayIso(), notice: "30" }),
    body: (v) => [`Dear ${or(v.manager, "Sir/Madam").split(",")[0]},`,
      `Please accept this letter as formal notice of my resignation from the position of ${or(v.from_role)} at ${or(v.company)}${v.reason ? `, ${v.reason.replace(/\.$/, "")}` : ""}. As per my notice period of ${n(v.notice) || 30} days, my last working day will be ${d(v.last_day)}.`,
      `I am grateful for the opportunities and support I have received here. I will do my best to complete a smooth handover of my work before I leave.`,
      `Kindly accept my resignation and let me know the exit formalities, including my relieving letter, experience certificate and full and final settlement.`].join("\n\n"),
    blocks: (v, _s, body) => [{ t: "meta", left: ["To,", ...(v.manager ? [v.manager] : []), or(v.company)], right: [`Date: ${d(v.date)}`] }, { t: "subject", text: "Resignation" }, { t: "p", text: body },
      { t: "p", text: "Yours sincerely,", align: "left" }, { t: "sign", right: { label: "", name: or(v.from_name), sub: v.from_role || undefined } }],
    fileName: (v) => `Resignation letter - ${or(v.from_name, "")}`
  },
  {
    key: "leave", label: "Leave application", note: "Ask for leave from work, school or college", color: "green", category: "Personal", letterhead: "none",
    fields: [{ key: "from_name", label: "Your name", required: true, half: true, group: "You" }, { key: "from_role", label: "Designation / class", placeholder: "Accounts Executive", half: true, group: "You" },
      { key: "to_whom", label: "Addressed to", type: "textarea", placeholder: "The Manager\nVistara Global LLP\nMansa", group: "To" },
      { key: "kind", label: "Type of leave", type: "select", options: ["casual leave", "sick leave", "earned leave", "leave for a family function", "leave for personal work"], half: true, group: "Leave" },
      { key: "from", label: "From", type: "date", half: true, required: true, group: "Leave" }, { key: "to", label: "To", type: "date", half: true, required: true, group: "Leave" },
      { key: "reason", label: "Reason", type: "textarea", placeholder: "e.g. my sister's wedding in Jaipur", group: "Leave" }, { key: "date", label: "Letter date", type: "date", half: true, group: "Leave" }],
    defaults: () => ({ date: todayIso(), kind: "casual leave" }),
    body: (v) => [`Respected Sir/Madam,`,
      `I request you to kindly grant me ${v.kind || "leave"} from ${d(v.from)} to ${d(v.to)}${v.reason ? ` due to ${v.reason.replace(/\.$/, "")}` : ""}.`,
      `I will make sure my pending work is handed over and will be reachable on my phone if anything urgent comes up.`,
      `Thank you for your consideration.`].join("\n\n"),
    blocks: (v, _s, body) => [{ t: "meta", left: ["To,", ...(v.to_whom ? v.to_whom.split("\n") : ["__________"])], right: [`Date: ${d(v.date)}`] }, { t: "subject", text: `Application for ${v.kind || "leave"}` }, { t: "p", text: body },
      { t: "p", text: "Yours faithfully,", align: "left" }, { t: "sign", right: { label: "", name: or(v.from_name), sub: v.from_role || undefined } }],
    fileName: (v) => `Leave application - ${or(v.from_name, "")}`
  },
  {
    key: "bank_request", label: "Letter to bank", note: "Cheque book, statement, KYC or address update, closure", color: "indigo", category: "Business",
    fields: [{ key: "bank", label: "Bank and branch", type: "textarea", placeholder: "The Branch Manager\nState Bank of India\nMansa Branch", required: true, group: "Bank" },
      { key: "account", label: "Account number", half: true, required: true, group: "Bank" }, { key: "holder", label: "Account holder name", half: true, group: "Bank" },
      { key: "request", label: "Request", type: "select", options: ["Issue a new cheque book", "Account statement", "Update KYC documents", "Change of address", "Change of registered mobile number", "Close the account"], group: "Request" },
      { key: "details", label: "Details", type: "textarea", placeholder: "e.g. statement from 1 April 2025 to 31 March 2026, for filing income tax", group: "Request" }, ...LETTER, ...SIGN],
    defaults: (s) => ({ ...today(), holder: s.business_name, request: "Issue a new cheque book" }),
    body: (v) => {
      const r = v.request || "Issue a new cheque book";
      const line: Record<string, string> = {
        "Issue a new cheque book": "Kindly issue a new cheque book for the above account.",
        "Account statement": "Kindly provide the account statement for the above account.",
        "Update KYC documents": "Kindly update the KYC records for the above account. Self-attested copies of the documents are enclosed.",
        "Change of address": "Kindly update the address on the above account. Proof of the new address is enclosed.",
        "Change of registered mobile number": "Kindly update the registered mobile number on the above account.",
        "Close the account": "Kindly close the above account and transfer the remaining balance as per the details below. Unused cheque leaves and the debit card are returned with this letter."
      };
      return [`Dear Sir/Madam,`, `${line[r] ?? line["Issue a new cheque book"]}${v.details ? ` ${v.details.replace(/\s*$/, "")}${/[.!?]$/.test(v.details.trim()) ? "" : "."}` : ""}`,
        `Account holder: ${or(v.holder)}\nAccount number: ${or(v.account)}`, `Thank you for your help.`].join("\n\n");
    },
    blocks: (v, s, body) => [{ t: "meta", left: ["To,", ...(v.bank ? v.bank.split("\n") : ["__________"])], right: refDate(v) }, { t: "subject", text: `Request: ${(v.request || "new cheque book").toLowerCase()} — A/c ${or(v.account)}` }, { t: "p", text: body },
      { t: "p", text: "Yours faithfully,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Letter to bank - ${v.request || "request"}`
  },
  {
    key: "payment_demand", label: "Payment demand letter", note: "Formal demand for overdue dues before legal steps", color: "orange", category: "Business",
    fields: [{ key: "to_whom", label: "Customer name and address", type: "textarea", required: true, group: "Customer" },
      { key: "amount", label: "Amount due ₹", type: "money", half: true, required: true, group: "Dues" }, { key: "invoices", label: "Invoice no(s). and date(s)", placeholder: "INV-104 dated 2 Aug 2026", half: true, group: "Dues" },
      { key: "days", label: "Pay within (days)", type: "number", half: true, group: "Dues" }, { key: "interest", label: "Interest on late payment (% a year, optional)", type: "number", half: true, group: "Dues" },
      { key: "bank", label: "Pay to (UPI / bank details)", type: "textarea", group: "Dues" }, ...LETTER, ...SIGN],
    defaults: (s) => ({ ...today(), days: "7", bank: [s.upi_id ? `UPI: ${s.upi_id}` : "", s.account_number ? `A/c ${s.account_number}, ${s.bank_name} (IFSC ${s.ifsc})` : ""].filter(Boolean).join("\n") }),
    body: (v, s) => [`Dear Sir/Madam,`,
      `As per our records, a sum of ${money(n(v.amount))} is outstanding from you towards ${v.invoices ? `invoice ${v.invoices}` : "goods/services supplied by us"}. Despite our earlier reminders, the payment has not been received.`,
      `We request you to clear the full amount within ${n(v.days) || 7} days of receiving this letter.${n(v.interest) > 0 ? ` Interest at ${n(v.interest)}% per annum will apply on the delayed amount.` : ""}`,
      ...(v.bank ? [`You can pay to:\n${v.bank}`] : []),
      `If the payment is not received within this time, we will be constrained to take further steps to recover the dues, without further notice. If you have already paid, please share the payment details and ignore this letter.`,
      `For ${s.business_name || "us"}, we value our relationship and hope to settle this amicably.`].join("\n\n"),
    blocks: (v, s, body) => [{ t: "meta", left: ["To,", ...(v.to_whom ? v.to_whom.split("\n") : ["__________"])], right: refDate(v) }, { t: "subject", text: `Demand for payment of outstanding dues of ${n(v.amount) > 0 ? rs(n(v.amount)) : "₹__________"}` }, { t: "p", text: body },
      { t: "p", text: "Yours faithfully,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => `Payment demand - ${or((v.to_whom ?? "").split("\n")[0], "customer")}`
  },
  {
    key: "self_declaration", label: "Self-declaration", note: "A simple signed declaration for any purpose", color: "gray", category: "Personal", letterhead: "none",
    fields: [{ key: "from_name", label: "Your full name", required: true, half: true, group: "You" }, { key: "relation", label: "Son/daughter/wife of", placeholder: "S/o Ram Kumar", half: true, group: "You" },
      { key: "address", label: "Address", type: "textarea", group: "You" }, { key: "id_proof", label: "ID (optional)", placeholder: "Aadhaar XXXX XXXX 1234", half: true, group: "You" },
      { key: "statement", label: "I declare that…", type: "textarea", required: true, placeholder: "I am not employed anywhere and have no regular income.", group: "Declaration" },
      { key: "place", label: "Place", half: true, group: "Declaration" }, { key: "date", label: "Date", type: "date", half: true, group: "Declaration" }],
    defaults: () => ({ date: todayIso() }),
    body: (v) => [`I, ${or(v.from_name)}${v.relation ? `, ${v.relation}` : ""}${v.address ? `, residing at ${v.address.replace(/\n/g, ", ")}` : ""}${v.id_proof ? ` (${v.id_proof})` : ""}, do hereby solemnly declare as follows:`,
      or(v.statement),
      `I declare that the above information is true and correct to the best of my knowledge and belief, and nothing material has been concealed.`].join("\n\n"),
    blocks: (v, _s, body) => [{ t: "title", text: "Self-Declaration" }, { t: "p", text: body },
      { t: "meta", left: [`Place: ${or(v.place)}`, `Date: ${d(v.date)}`], right: [] }, { t: "sign", right: { label: "Signature", name: or(v.from_name) } }],
    fileName: (v) => `Self-declaration - ${or(v.from_name, "")}`
  },
  {
    key: "custom", label: "Custom letter", note: "Write any letter on your letterhead", color: "graphite", category: "Business",
    fields: [{ key: "to_whom", label: "To (name and address)", type: "textarea", placeholder: "The Manager\nABC Pvt. Ltd.\nNew Delhi", group: "Letter" },
      { key: "subject", label: "Subject", group: "Letter" }, ...LETTER, ...SIGN],
    defaults: () => ({ date: todayIso() }),
    body: () => "Dear Sir/Madam,\n\nWrite your letter here.\n\nThank you.",
    blocks: (v, s, body) => [{ t: "meta", left: v.to_whom ? ["To,", ...v.to_whom.split("\n")] : [], right: refDate(v) }, ...(v.subject ? [{ t: "subject", text: v.subject } as Block] : []), { t: "p", text: body }, { t: "p", text: "Yours sincerely,", align: "left" }, { t: "sign", right: signer(s, v) }],
    fileName: (v) => (v.subject ? `Letter - ${v.subject}` : "Letter")
  }
];

export function monthsBetween(from: string | undefined, to: string | undefined): string[] {
  if (!from || !/^\d{4}-\d{2}$/.test(from)) return [todayIso().slice(0, 7)];
  const end = to && /^\d{4}-\d{2}$/.test(to) && to >= from ? to : from;
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  while (out.length < 24) {
    const k = `${y}-${String(m).padStart(2, "0")}`; out.push(k);
    if (k >= end) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export const templateFor = (key: string) => TEMPLATES.find((t) => t.key === key) ?? null;
export const safeFileName = (x: string) => x.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || "Letter";
