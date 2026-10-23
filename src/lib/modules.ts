export const modules = [
  { key: "documents", name: "Document Genius" },
  { key: "career", name: "Resume & Career Studio" },
  { key: "creative", name: "Product Photo & Ad Studio" },
  { key: "invoices", name: "Invoice & Receipt Manager" },
  { key: "contracts", name: "Agreement Studio" }
] as const;

export type ModuleKey = typeof modules[number]["key"];
