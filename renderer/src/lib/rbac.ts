// Permission-based access control — flags synced from desktop OrgRole + session.

import { useEffect, useState } from "react";

import { getSession, subscribeAuth, getCurrentUser } from "./auth-store";
import {
  canManageUsers,
  getEffectivePermissions,
  getEnterpriseRoleId,
  hasPermission,
} from "./permissions-store";
import { isEnterpriseLicenseActive } from "./license-store";
import {
  ENTERPRISE_ROLES,
  MODULE_ACCESS,
  ROLES,
  ROUTE_PERMISSIONS,
  isEnterpriseRoute,
  type Role,
} from "./permissions-constants";

export type { Role } from "./permissions-constants";
export {
  ENTERPRISE_ROLES,
  MODULE_ACCESS,
  ROLES,
  ROUTE_PERMISSIONS,
  isEnterpriseRoute,
};

const USERS_KEY = "benben.users.v1";
const ROLES_KEY = "benben.user_roles.v1";
const ACTING_KEY = "benben.acting_role.v1";

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const r = localStorage.getItem(k);
    return r ? (JSON.parse(r) as T) : fb;
  } catch {
    return fb;
  }
}
function write<T>(k: string, v: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}

const listeners = new Set<() => void>();
export function subscribeRbac(fn: () => void): () => void {
  listeners.add(fn);
  const unsubAuth = subscribeAuth(fn);
  return () => {
    listeners.delete(fn);
    unsubAuth();
  };
}
function emit() {
  listeners.forEach((l) => l());
}

function getRoleMap(): Record<string, Role> {
  return read<Record<string, Role>>(ROLES_KEY, {});
}
function setRoleMap(m: Record<string, Role>) {
  write(ROLES_KEY, m);
  emit();
}

export function getRoleFor(userId: string): Role {
  const explicit = getRoleMap()[userId];
  if (explicit) return explicit;
  const u = getCurrentUser();
  if (u && u.id === userId) {
    if (u.role === "admin") return "admin";
    const dept = (u.department || "").toLowerCase();
    if (dept === "sales") return "sales_staff";
    if (dept === "finance") return "finance_staff";
    if (dept === "hr") return "hr_staff";
    if (dept === "purchasing") return "warehouse_manager";
    if (dept === "warehouse" || dept === "inventory") return "warehouse_clerk";
  }
  return getEnterpriseRoleId();
}

export function assignRole(userId: string, role: Role) {
  const m = getRoleMap();
  m[userId] = role;
  setRoleMap(m);
}

export function getActingRole(): Role | null {
  return read<Role | null>(ACTING_KEY, null);
}
export function setActingRole(r: Role | null) {
  if (r === null) localStorage.removeItem(ACTING_KEY);
  else write(ACTING_KEY, r);
  emit();
}

export function getCurrentRole(): Role {
  const s = getSession();
  if (!s) return getEnterpriseRoleId();
  const real = getRoleFor(s.userId);
  if (canManageUsers()) {
    const acting = getActingRole();
    if (acting) return acting;
  }
  return real;
}

export function isAdmin(): boolean {
  return canManageUsers();
}

/** Departmental permission matrix only — ignores enterprise license state. */
export function canAccessRbacOnly(path: string, _role: Role = getCurrentRole()): boolean {
  const required = ROUTE_PERMISSIONS[path];
  if (!required) return true;
  const perms = getEffectivePermissions();
  const keys = Array.isArray(required) ? required : [required];
  if (path === "/users" || path === "/locations") return canManageUsers();
  return keys.some((k) => perms[k]);
}

/** RBAC plus enterprise license gate for designated premium module paths. */
export function canAccess(path: string, _role: Role = getCurrentRole()): boolean {
  if (!canAccessRbacOnly(path, _role)) return false;
  if (isEnterpriseRoute(path) && !isEnterpriseLicenseActive()) return false;
  return true;
}

export function canExportReports(): boolean {
  return hasPermission("export_reports");
}

export type InventoryMode = "full" | "receive" | "read";
export function inventoryMode(_role: Role = getCurrentRole()): InventoryMode {
  const perms = getEffectivePermissions();
  if (perms.modify_inventory) return "full";
  if (perms.view_inventory && perms.view_operations) return "receive";
  return "read";
}

export function useRole(): Role {
  const [r, setR] = useState<Role>(() => getCurrentRole());
  useEffect(() => subscribeRbac(() => setR(getCurrentRole())), []);
  return r;
}
