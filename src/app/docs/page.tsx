import type { Metadata } from "next";
import { Combine, EyeOff, FilePen, FileType2, FileStack, LayoutTemplate, Languages, ListChecks, Mail, MessageSquareText, Minimize2, PenLine, ScanLine, ScanText, Stamp, Send, Signature, Table, GitCompareArrows, Landmark, BookCheck, Diff, Network, BookOpen, GraduationCap, FileSpreadsheet, ScrollText, Users } from "lucide-react";
import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "Documents · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default function DocsPage() {
  return (
    <Hub area="docs" path="/docs" title="Documents" tag="PDF, sign and AI" intro="Edit and sign PDFs, send them for signing, draft agreements and letters, and let AI read long documents for you." sections={[
      { title: "Contract review", rows: [
        { href: "/tools/agreements/explain", title: "Explain a contract", text: "Plain-language summary and risks", Icon: MessageSquareText, tint: "orange" },
        { href: "/tools/agreements/conflicts", title: "Find conflicts", text: "Compare contracts and policies clause by clause", Icon: GitCompareArrows, tint: "orange" },
        { href: "/tools/agreements/law-impact", title: "New-law impact check", text: "Which contracts must change for a new rule", Icon: Landmark, tint: "orange" },
        { href: "/tools/agreements/playbook", title: "Firm playbook", text: "Check contracts against your standard terms", Icon: BookCheck, tint: "orange" },
        { href: "/tools/compare", title: "Compare versions", text: "Every change between two drafts, word by word", Icon: Diff, tint: "orange" },
        { href: "/tools/read", title: "Read mode", text: "Phone-friendly view of any PDF or Word file", Icon: BookOpen, tint: "teal" },
        { href: "/tools/agreements/clause-map", title: "Clause map", text: "How clauses and definitions connect", Icon: Network, tint: "orange" }
      ] },
      { title: "PDF", rows: [
        { href: "/tools/scan", title: "Scan & convert", text: "Photo, ID or screenshot to HD PDF, Word or text", Icon: ScanLine, tint: "red" },
        { href: "/tools/edit", title: "Edit PDF", text: "Text, highlights, notes, forms, images", Icon: PenLine, tint: "blue" },
        { href: "/tools/edit", title: "Redact a PDF", text: "Black out PAN, Aadhaar, phone, account numbers", Icon: EyeOff, tint: "red" },
        { href: "/tools/edit", title: "Stamp a PDF", text: "Paid, Approved, company seal, signatory", Icon: Stamp, tint: "red" },
        { href: "/tools/pdf/merge", title: "Merge PDFs", text: "Combine files in the order you want", Icon: Combine, tint: "red" },
        { href: "/tools/pdf/compress", title: "Compress PDF", text: "Make files smaller to share", Icon: Minimize2, tint: "red" },
        { href: "/tools/scan", title: "PDF to Word", text: "Editable Word or text from any PDF", Icon: FileType2, tint: "blue" },
        { href: "/tools/pdf", title: "All PDF tools", text: "Split, rotate, protect, convert and more", Icon: FileStack, tint: "red" }
      ] },
      { title: "Sign", rows: [
        { href: "/tools/sign", title: "Sign a PDF", text: "Draw or type your signature", Icon: Signature, tint: "indigo" },
        { href: "/tools/sign/requests", title: "Request signatures", text: "Send for others to sign by private link", Icon: Send, tint: "indigo" }
      ] },
      { title: "Write", rows: [
        { href: "/templates", title: "Templates library", text: "35+ Indian formats: HR, bank, GST, rent, agreements", Icon: LayoutTemplate, tint: "blue" },
        { href: "/tools/agreements", title: "Agreements", text: "Draft India-ready agreements with AI", Icon: FilePen, tint: "purple" },
        { href: "/tools/letters", title: "Business letters", text: "Offer letters, salary slips, NOC, rent receipts", Icon: Mail, tint: "blue" },
        { href: "/tools/letters/bulk", title: "Bulk offer letters", text: "Offer, appointment or experience letters for many people at once", Icon: Users, tint: "indigo" }
      ] },
      { title: "AI", rows: [
        { href: "/tools/study", title: "Quizzes & flashcards", text: "Practice tests from notes or a chapter, in Hindi too", Icon: GraduationCap, tint: "purple" },
        { href: "/tools/exam", title: "Question paper maker", text: "Exam papers with sections, marks and answer key", Icon: ScrollText, tint: "purple" },
        { href: "/tools/policies", title: "Company policy Q&A", text: "Employees ask, answers come from your HR policies", Icon: BookCheck, tint: "cyan" },
        { href: "/tools/statement", title: "Bank statement to Excel", text: "Every transaction, with balances checked", Icon: FileSpreadsheet, tint: "green" },
        { href: "/tools/chat", title: "Chat with a document", text: "Ask questions, get answers with page numbers", Icon: MessageSquareText, tint: "cyan" },
        { href: "/tools/documents?task=summary", title: "Summarize", text: "Key points from long documents", Icon: ListChecks, tint: "cyan" },
        { href: "/tools/documents?task=translate", title: "Translate", text: "Into 25 languages, incl. Hindi", Icon: Languages, tint: "teal" },
        { href: "/tools/documents?task=extract_text", title: "Read scanned text (OCR)", text: "From scans and photos", Icon: ScanText, tint: "cyan" },
        { href: "/tools/documents?task=tables", title: "Extract tables", text: "To a spreadsheet you can edit", Icon: Table, tint: "green" }
      ] }
    ]} />
  );
}
