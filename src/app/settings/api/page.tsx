import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { ApiKeys } from "./ApiKeys";

export const metadata: Metadata = { title: "Developer API · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function ApiPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/settings/api");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const isAdmin = (workspace.role === "owner" || workspace.role === "admin") && workspace.access === "edit";
  return (
    <AppShell ctx={{ ...ctx, workspace }} active="settings" breadcrumb="Developer API">
      <Link href="/account" className="back-link"><ChevronLeft size={16} aria-hidden="true" /> Account</Link>
      <div className="welcome-row">
        <div>
          <h1>Developer <span>API</span></h1>
          <p className="subtitle">Use GeniusAI&apos;s document tools from your own app or website: summaries, translation, text and table extraction, document Q&amp;A, bank statements and quizzes. Requests use {workspace.name}&apos;s credits. <Link href="/developers">Read the API guide</Link>.</p>
        </div>
      </div>
      {isAdmin ? <ApiKeys /> : <p className="form-message warning">Only the workspace owner or an admin can create API keys.</p>}
    </AppShell>
  );
}
