import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { domainOf, isPublicDomain } from "./domains";

export type DomainOffer = { workspaceId: string; workspaceName: string; domain: string; access: "edit" | "view" };

/**
 * A workspace the signed-in user can join with their company email, if any: their email must be
 * confirmed, on a claimed (non-public) domain, and they mustn't already be a member. Uses the
 * service-role client because the user isn't a member yet.
 */
export async function findDomainOffer(admin: SupabaseClient, user: Pick<User, "id" | "email" | "email_confirmed_at">): Promise<DomainOffer | null> {
  const domain = domainOf(user.email);
  if (!domain || isPublicDomain(domain) || !user.email_confirmed_at) return null;
  const { data, error } = await admin.from("workspace_domains").select("workspace_id, access").eq("domain", domain).maybeSingle();
  if (error || !data) return null;
  const row = data as { workspace_id: string; access: "edit" | "view" };
  const { data: member } = await admin.from("workspace_members").select("user_id").eq("workspace_id", row.workspace_id).eq("user_id", user.id).maybeSingle();
  if (member) return null;
  const { data: ws } = await admin.from("workspaces").select("name").eq("id", row.workspace_id).maybeSingle();
  if (!ws) return null;
  return { workspaceId: row.workspace_id, workspaceName: (ws as { name: string }).name, domain, access: row.access };
}
