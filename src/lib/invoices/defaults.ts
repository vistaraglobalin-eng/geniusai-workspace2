import type { Item, Party } from "./calc";
import type { InvoiceSettings } from "./render";

export const EMPTY_SETTINGS: InvoiceSettings = {
  business_name: "", address: "", state_code: "", gstin: "", pan: "", phone: "", email: "", website: "", logo_png: null, signature_png: null,
  bank_name: "", account_name: "", account_number: "", ifsc: "", upi_id: "", terms: "", prefix_invoice: "INV", prefix_quote: "QT", prefix_receipt: "RCT", accent: "#4f46e5"
};
export const EMPTY_PARTY: Party = { name: "", address: "", state_code: "", gstin: "", phone: "", email: "" };
export const NEW_ITEM: Item = { description: "", hsn: "", qty: 1, unit: "pcs", rate: 0, discount: 0, gst: 18 };

