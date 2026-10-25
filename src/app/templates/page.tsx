import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { TemplateLibrary } from "./TemplateLibrary";

export const metadata: Metadata = { title: "Templates · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/templates");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="templates" breadcrumb="Templates">
      <div className="welcome-row">
        <div>
          <h1>Templates</h1>
          <p className="subtitle">Ready formats for Indian businesses — invoices, HR letters, bank letters, agreements and more. Fill a short form and download PDF or Word.</p>
        </div>
      </div>
      <TemplateLibrary />
    </AppShell>
  );
}
