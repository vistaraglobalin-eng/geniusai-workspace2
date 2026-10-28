import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadWorkspaceContext } from "@/lib/workspace";
import { AppShell, type NavKey } from "@/components/AppShell";
import { HubBody, type HubSection } from "@/components/HubBody";
import { getLang } from "@/lib/i18n-server";
export type { HubRow, HubSection } from "@/components/HubBody";


/** One area of the app (Money, Documents, Create, Account): every tool in it, grouped. */
export async function Hub({ area, path, title, tag, intro, sections }: { area: NavKey; path: string; title: string; tag: string; intro: string; sections: HubSection[] }) {
  const supabase = await createSupabaseServerClient();
  const ctx = await loadWorkspaceContext(supabase);
  if (!ctx) redirect(`/login?next=${path}`);
  if (!ctx.workspace) redirect("/onboarding");
  const workspace = ctx.workspace;
  const lang = await getLang();
  return (
    <AppShell ctx={{ ...ctx, workspace }} active={area} breadcrumb={title}>
      <HubBody title={title} tag={tag} intro={intro} sections={sections} lang={lang} />
    </AppShell>
  );
}
