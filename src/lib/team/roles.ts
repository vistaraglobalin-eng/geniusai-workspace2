// Team roles as people see them. Stored as role (owner/admin/member) + access (edit/view).

export type Role = "owner" | "admin" | "member";
export type Access = "edit" | "view";
export type TeamRole = "owner" | "admin" | "editor" | "viewer";

export const TEAM_ROLES: { key: Exclude<TeamRole, "owner">; label: string; note: string }[] = [
  { key: "admin", label: "Admin", note: "Everything, plus invite and remove people" },
  { key: "editor", label: "Editor", note: "Create and edit invoices, files, letters and more" },
  { key: "viewer", label: "Viewer", note: "Can look, can't change anything or use credits" }
];

export function teamRole(role: Role, access: Access | undefined): TeamRole {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return access === "view" ? "viewer" : "editor";
}
export function fromTeamRole(r: Exclude<TeamRole, "owner">): { role: Exclude<Role, "owner">; access: Access } {
  return r === "admin" ? { role: "admin", access: "edit" } : r === "editor" ? { role: "member", access: "edit" } : { role: "member", access: "view" };
}
export const TEAM_ROLE_LABEL: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };
export const roleLabel = (role: Role, access: Access | undefined) => TEAM_ROLE_LABEL[teamRole(role, access)];
