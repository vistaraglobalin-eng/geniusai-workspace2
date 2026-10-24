import type { Metadata } from "next";
import { Building2, FolderOpen, LayoutGrid, Palette, ShieldCheck, UserRound, Users, Zap } from "lucide-react";
import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "Account · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default function AccountPage() {
  return (
    <Hub area="account" path="/account" title="Account" tag="Your workspace" intro="Your files, team, plan and settings." sections={[
      { title: "Workspace", rows: [
        { href: "/files", title: "Files", text: "Everything you've uploaded or saved", Icon: FolderOpen, tint: "cyan" },
        { href: "/settings/team", title: "Team members", text: "Invite people, choose who can edit", Icon: Users, tint: "teal" },
        { href: "/billing", title: "Plans & credits", text: "Credits for AI tools", Icon: Zap, tint: "green" },
        { href: "/tools/invoices/settings", title: "Business details", text: "Used on invoices, letters and cards", Icon: Building2, tint: "gray" }
      ] },
      { title: "You", rows: [
        { href: "/settings#profile", title: "Profile", text: "Your name and email", Icon: UserRound, tint: "blue" },
        { href: "/settings#appearance", title: "Appearance", text: "Light or dark, colour, text size", Icon: Palette, tint: "purple" },
        { href: "/settings#privacy", title: "Privacy & security", text: "Sign out everywhere, download or delete data", Icon: ShieldCheck, tint: "gray" }
      ] },
      { title: "Everything", rows: [
        { href: "/tools", title: "All tools", text: "Every tool in one list", Icon: LayoutGrid, tint: "gray" }
      ] }
    ]} />
  );
}
