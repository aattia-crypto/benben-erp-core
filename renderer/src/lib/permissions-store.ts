/**
 * Effective permission flags for the signed-in user (synced from desktop session).
 * Imports only leaf constants — never rbac or auth-store (avoids circular init).
 */
import type { DesktopAuthSessionDto } from "./desktop-types";
import {
  ADMIN_ALL_PERMISSIONS,
  ALL_FALSE_PERMISSIONS,
  type PermissionKey,
  type PermissionMap,
} from "./permissions-constants";

export type { PermissionKey, PermissionMap } from "./permissions-constants";

const STORAGE_KEY = "benben.effective_permissions.v1";
const ROLE_KEY = "benben.enterprise_role.v1";

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fb;
  } catch {
    return fb;
  }
}

function write<T>(k: string, v: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}

export function syncPermissionsFromSession(dto: DesktopAuthSessionDto): void {
  if (dto.permissions) {
    write(STORAGE_KEY, dto.permissions);
    write(ROLE_KEY, dto.role);
    return;
  }
  if (dto.role === "admin") write(STORAGE_KEY, ADMIN_ALL_PERMISSIONS);
}

export function clearStoredPermissions(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getEffectivePermissions(): PermissionMap {
  return read<PermissionMap>(STORAGE_KEY, ADMIN_ALL_PERMISSIONS);
}

export function getEnterpriseRoleId(): string {
  return read<string>(ROLE_KEY, "admin");
}

export function hasPermission(key: PermissionKey): boolean {
  return !!getEffectivePermissions()[key];
}

export function canManageUsers(): boolean {
  return hasPermission("manage_users");
}

export function usePermissions(): PermissionMap {
  return getEffectivePermissions();
}
