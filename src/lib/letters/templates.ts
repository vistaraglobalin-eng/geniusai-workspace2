// Business letter templates. Each template has a short form; its text is generated from the form and
// can then be edited freely before making the PDF / Word file.

import { amountInWords, inr, showDate, todayIso } from "@/lib/invoices/calc";
import type { InvoiceSettings } from "@/lib/invoices/render";
import type { Block, LetterheadStyle } from "./render";

export type FieldType = "text" | "date" | "money" | "number" | "textarea" | "select" | "month";
export type Field = { key: string; label: string; type?: FieldType; placeholder?: string; options?: string[]; half?: boolean; required?: boolean; group?: string };
export type Values = Record<string, string>;
export type TemplateKey =
  | "offer" | "appointment" | "experience" | "relieving" | "salary_slip" | "increment" | "noc" | "rent_receipt" | "authorization" | "custom";

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
