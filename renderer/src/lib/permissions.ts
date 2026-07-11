import { getCurrentRole, type Role } from "./rbac";

export type Permission =
  | "gl.view"
  | "gl.post"
  | "ar.view"
  | "ar.post"
  | "ap.view"
  | "ap.post"
  | "crm.view"
  | "crm.edit"
  | "reports.view"
  | "admin.users";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "gl.view",
    "gl.post",
    "ar.view",
    "ar.post",
    "ap.view",
    "ap.post",
    "crm.view",
    "crm.edit",
    "reports.view",
    "admin.users",
  ],
  finance: ["gl.view", "gl.post", "ar.view", "ar.post", "ap.view", "ap.post", "reports.view"],
  sales: ["crm.view", "crm.edit", "ar.view", "reports.view"],
  purchasing: ["ap.view", "ap.post", "crm.view"],
  warehouse: ["crm.view"],
};

/** Extended enterprise roles mapped onto base Role for now. */
export const ENTERPRISE_ROLES = [
  "Admin",
  "Accountant",
  "AP Clerk",
  "AR Clerk",
  "Sales Manager",
  "Sales Rep",
  "Read Only",
] as const;

export function hasPermission(permission: Permission, role: Role = getCurrentRole()): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canPostGl(role: Role = getCurrentRole()): boolean {
  return hasPermission("gl.post", role);
}

export function canViewReports(role: Role = getCurrentRole()): boolean {
  return hasPermission("reports.view", role);
}
