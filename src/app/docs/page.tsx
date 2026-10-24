import type { Metadata } from "next";
import { Combine, FilePen, FileStack, Languages, ListChecks, Mail, MessageSquareText, Minimize2, PenLine, ScanText, Send, Signature, Table } from "lucide-react";
import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "Documents · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default function DocsPage() {
  return (
    <Hub area="docs" path="/docs" title="Documents" tag="PDF, sign and AI" intro="Edit and sign PDFs, send them for signing, draft agreements and letters, and let AI read long documents for you." sections={[
      { title: "PDF", rows: [
        { href: "/tools/edit", title: "Edit PDF", text: "Text, highlights, notes, forms, images", Icon: PenLine, tint: "blue" },
        { href: "/tools/pdf/merge", title: "Merge PDFs", text: "Combine files in the order you want", Icon: Combine, tint: "red" },
        { href: "/tools/pdf/compress", title: "Compress PDF", text: "Make files smaller to share", Icon: Minimize2, tint: "red" },
        { href: "/tools/pdf", title: "All PDF tools", text: "Split, rotate, protect, convert and more", Icon: FileStack, tint: "red" }
      ] },
      { title: "Sign", rows: [
        { href: "/tools/sign", title: "Sign a PDF", text: "Draw or type your signature", Icon: Signature, tint: "indigo" },
        { href: "/tools/sign/requests", title: "Request signatures", text: "Send for others to sign by private link", Icon: Send, tint: "indigo" }
      ] },
      { title: "Write", rows: [
        { href: "/tools/agreements", title: "Agreements", text: "Draft India-ready agreements with AI", Icon: FilePen, tint: "purple" },
        { href: "/tools/letters", title: "Business letters", text: "Offer letters, salary slips, NOC, rent receipts", Icon: Mail, tint: "blue" }
      ] },
      { title: "AI", rows: [
        { href: "/tools/documents?task=summary", title: "Summarize", text: "Key points from long documents", Icon: ListChecks, tint: "cyan" },
        { href: "/tools/agreements/explain", title: "Explain a contract", text: "Plain-language summary and risks", Icon: MessageSquareText, tint: "orange" },
        { href: "/tools/documents?task=translate", title: "Translate", text: "Into 25 languages, incl. Hindi", Icon: Languages, tint: "teal" },
        { href: "/tools/documents?task=extract_text", title: "Read scanned text (OCR)", text: "From scans and photos", Icon: ScanText, tint: "cyan" },
        { href: "/tools/documents?task=tables", title: "Extract tables", text: "To a spreadsheet you can edit", Icon: Table, tint: "green" }
      ] }
    ]} />
  );
}
