import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell } from "@/components/AppShell";
import { loadPolicyLibrary } from "@/lib/policies-server";
import { POLICY_DAILY_LIMIT, istDayStart } from "@/lib/policies";
import { PolicyDesk } from "./PolicyDesk";

export const metadata: Metadata = { title: "Policy Q&A · GeniusAI Workspace" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect("/login?next=/tools/policies");
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;

  const lib = await loadPolicyLibrary(supabase, workspace.id);
  // Questions already asked today (own jobs are readable under row-level security).
  const { count } = await supabase.from("ai_jobs").select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id).eq("requested_by", ctx.user.id).eq("task_type", "policy_qa").gte("created_at", istDayStart());

  return (
    <AppShell ctx={{ ...ctx, workspace }} active="policies" breadcrumb="Policy Q&A">
      <div className="welcome-row">
        <div>
          <h1>Company policy <span>Q&amp;A</span></h1>
          <p className="subtitle">Ask about leave, notice period, expenses, work from home and more. Answers come only from {workspace.name}&apos;s own policy documents, with the source for every point.</p>
        </div>
      </div>
      <PolicyDesk
        setupNeeded={lib.setupNeeded}
        docs={lib.docs.map((d) => ({ id: d.id, name: d.name, spaceName: d.spaceName }))}
        skipped={lib.skipped}
        librarySpaces={lib.spaces}
        isAdmin={workspace.role === "owner" || workspace.role === "admin"}
        askedToday={count ?? 0}
        dailyLimit={POLICY_DAILY_LIMIT}
        workspaceName={workspace.name}
      />
    </AppShell>
  );
}
