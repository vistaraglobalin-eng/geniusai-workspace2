import type { Metadata } from "next";
import { BriefcaseBusiness, Contact, FileType2, Image as ImageIcon, Megaphone } from "lucide-react";
import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "Create · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default function CreatePage() {
  return (
    <Hub area="create" path="/create" title="Create" tag="Look professional" intro="Product photos and ad posts, visiting cards, letterhead and resumes — made on your phone, free." sections={[
      { title: "Sell", rows: [
        { href: "/tools/photos", title: "Product photos", text: "Remove background, marketplace-ready photos", Icon: ImageIcon, tint: "orange" },
        { href: "/tools/photos", title: "Ad posts", text: "Instagram, WhatsApp status and banners", Icon: Megaphone, tint: "orange" }
      ] },
      { title: "Brand", rows: [
        { href: "/tools/cards", title: "Visiting card", text: "6 designs with a QR code, print or share", Icon: Contact, tint: "orange" },
        { href: "/tools/cards?tab=letterhead", title: "Letterhead", text: "PDF or Word with your logo", Icon: FileType2, tint: "orange" }
      ] },
      { title: "Career", rows: [
        { href: "/tools/career", title: "Resumes", text: "Professional resumes, job match, cover letters", Icon: BriefcaseBusiness, tint: "purple" }
      ] }
    ]} />
  );
}
