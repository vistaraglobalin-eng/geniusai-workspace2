import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cookie that remembers which workspace you're working in (when you belong to more than one). */
export const WORKSPACE_COOKIE = "ga_ws";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceSummary = {
  id: string;
  name: string;
  kind: "personal" | "business";
  defaultCurrency: string;
  role: WorkspaceRole;
  /** "view" = view-only team member. */
  access: "edit" | "view";
};
export type WorkspaceChoice = { id: string; name: string; role: WorkspaceRole; access: "edit" | "view" };

export type FileSummary = {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  scanStatus: "pending" | "clean" | "quarantined" | "failed";
  /** Set on the Files page when Spaces are installed. */
  spaceId?: string | null;
  createdAt: string;
  uploadedBy: string;
};

export type WorkspaceContext = {
  user: { id: string; email: string | null };
  displayName: string | null;
  onboarded: boolean;
  workspace: WorkspaceSummary | null;
  /** Every workspace you belong to (for the switcher). */
  workspaces: WorkspaceChoice[];
  credits: { available: number; reserved: number } | null;
  plan: { name: string; status: string } | null;
  recentFiles: FileSummary[];
  /** Unread mentions and replies for you in this workspace (0 before the Comments update is installed). */
  unread: number;
};

type MembershipRow = {
  role: WorkspaceRole;
  access?: "edit" | "view";
  workspace:
    | { id: string; name: string; kind: "personal" | "business"; default_currency: string }
    | { id: string; name: string; kind: "personal" | "business"; default_currency: string }[]
    | null;
};

/**
 * Loads everything the dashboard needs for the signed-in user, through RLS.
 * The current workspace is the one chosen in the switcher (cookie), else the
 * oldest membership.
 */
export async function loadWorkspaceContext(supabase: SupabaseClient): Promise<WorkspaceContext | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const membershipQuery = (cols: string) => supabase
    .from("workspace_members")
    .select(cols)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(20);
  const [profileResult, firstTry] = await Promise.all([
    supabase.from("profiles").select("display_name, onboarding_completed_at").eq("user_id", user.id).maybeSingle(),
    membershipQuery("role, access, workspace:workspaces(id, name, kind, default_currency)")
  ]);
  // Before the Team update is installed there is no "access" column; fall back so nothing breaks.
  const membershipResult = firstTry.error && /access/.test(firstTry.error.message)
    ? await membershipQuery("role, workspace:workspaces(id, name, kind, default_currency)")
    : firstTry;

  const profile = profileResult.data as { display_name: string | null; onboarding_completed_at: string | null } | null;
  const memberships = ((membershipResult.data ?? []) as unknown as MembershipRow[])
    .map((m) => ({ m, ws: Array.isArray(m.workspace) ? m.workspace[0] : m.workspace }))
    .filter((x): x is { m: MembershipRow; ws: NonNullable<typeof x.ws> } => !!x.ws);
  let chosenId: string | undefined;
  try { chosenId = (await cookies()).get(WORKSPACE_COOKIE)?.value; } catch { /* not in a request */ }
  const current = memberships.find((x) => x.ws.id === chosenId) ?? memberships[0];
  const membership = current?.m ?? null;
  const ws = current?.ws;

  const base: WorkspaceContext = {
    user: { id: user.id, email: user.email ?? null },
    displayName: profile?.display_name ?? null,
    onboarded: Boolean(profile?.onboarding_completed_at),
    workspace: null,
    workspaces: memberships.map(({ m, ws: w }) => ({ id: w.id, name: w.name, role: m.role, access: m.access === "view" ? "view" : "edit" })),
    credits: null,
    plan: null,
    recentFiles: [],
    unread: 0
  };
  if (!membership || !ws) return base;

  const workspace: WorkspaceSummary = {
    id: ws.id,
    name: ws.name,
    kind: ws.kind,
    defaultCurrency: ws.default_currency,
    role: membership.role,
    access: membership.access === "view" ? "view" : "edit"
  };

  const [creditsResult, subscriptionResult, filesResult, unreadResult] = await Promise.all([
    supabase.from("credit_accounts").select("available_credits, reserved_credits").eq("workspace_id", ws.id).maybeSingle(),
    supabase
      .from("subscriptions")
      .select("status, plan:plan_catalog(display_name)")
      .eq("workspace_id", ws.id)
      .maybeSingle(),
    supabase
      .from("files")
      .select("id, object_key, original_filename, mime_type, byte_size, scan_status, created_at, uploaded_by")
      .eq("workspace_id", ws.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("workspace_id", ws.id).is("read_at", null)
  ]);

  const credits = creditsResult.data as { available_credits: number; reserved_credits: number } | null;
  const subscription = subscriptionResult.data as
    | { status: string; plan: { display_name: string } | { display_name: string }[] | null }
    | null;
  const planRow = Array.isArray(subscription?.plan) ? subscription?.plan[0] : subscription?.plan;

  type FileRow = {
    id: string;
    object_key: string;
    original_filename: string;
    mime_type: string;
    byte_size: number;
    scan_status: FileSummary["scanStatus"];
    created_at: string;
    uploaded_by: string;
  };
  const files = (filesResult.data ?? []) as FileRow[];

  return {
    ...base,
    workspace,
    credits: credits
      ? { available: Number(credits.available_credits), reserved: Number(credits.reserved_credits) }
      : null,
    plan: subscription && planRow ? { name: planRow.display_name, status: subscription.status } : null,
    recentFiles: files.map((f) => ({
      id: f.id,
      objectKey: f.object_key,
      originalFilename: f.original_filename,
      mimeType: f.mime_type,
      byteSize: Number(f.byte_size),
      scanStatus: f.scan_status,
      createdAt: f.created_at,
      uploadedBy: f.uploaded_by
    })),
    unread: unreadResult.error ? 0 : unreadResult.count ?? 0
  };
}
