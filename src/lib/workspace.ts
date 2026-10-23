import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceSummary = {
  id: string;
  name: string;
  kind: "personal" | "business";
  defaultCurrency: string;
  role: WorkspaceRole;
};

export type FileSummary = {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  scanStatus: "pending" | "clean" | "quarantined" | "failed";
  createdAt: string;
  uploadedBy: string;
};

export type WorkspaceContext = {
  user: { id: string; email: string | null };
  displayName: string | null;
  onboarded: boolean;
  workspace: WorkspaceSummary | null;
  credits: { available: number; reserved: number } | null;
  plan: { name: string; status: string } | null;
  recentFiles: FileSummary[];
};

type MembershipRow = {
  role: WorkspaceRole;
  workspace:
    | { id: string; name: string; kind: "personal" | "business"; default_currency: string }
    | { id: string; name: string; kind: "personal" | "business"; default_currency: string }[]
    | null;
};

/**
 * Loads everything the dashboard needs for the signed-in user, through RLS.
 * The user's first workspace (oldest membership) is the current one; a
 * workspace switcher can replace this later.
 */
export async function loadWorkspaceContext(supabase: SupabaseClient): Promise<WorkspaceContext | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, membershipResult] = await Promise.all([
    supabase.from("profiles").select("display_name, onboarding_completed_at").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name, kind, default_currency)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  const profile = profileResult.data as { display_name: string | null; onboarding_completed_at: string | null } | null;
  const membership = membershipResult.data as MembershipRow | null;
  const ws = Array.isArray(membership?.workspace) ? membership?.workspace[0] : membership?.workspace;

  const base: WorkspaceContext = {
    user: { id: user.id, email: user.email ?? null },
    displayName: profile?.display_name ?? null,
    onboarded: Boolean(profile?.onboarding_completed_at),
    workspace: null,
    credits: null,
    plan: null,
    recentFiles: []
  };
  if (!membership || !ws) return base;

  const workspace: WorkspaceSummary = {
    id: ws.id,
    name: ws.name,
    kind: ws.kind,
    defaultCurrency: ws.default_currency,
    role: membership.role
  };

  const [creditsResult, subscriptionResult, filesResult] = await Promise.all([
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
      .limit(8)
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
    }))
  };
}
