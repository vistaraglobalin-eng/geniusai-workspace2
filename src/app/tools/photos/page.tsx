import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { PhotoStudio } from "./PhotoStudio";

export const metadata: Metadata = { title: "Product Photos & Ads · GeniusAI Workspace" };

export default async function PhotosPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/photos");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="creative" breadcrumb="Product Photos & Ads">
      <div className="welcome-row">
        <div>
          <h1>Product Photos & Ads</h1>
          <p className="subtitle">Remove the background, make marketplace-ready photos, and design ads for Instagram, WhatsApp and Facebook. Free, and it runs on your phone.</p>
        </div>
      </div>
      <PhotoStudio workspaceId={workspace.id} />
    </AppShell>
  );
}
