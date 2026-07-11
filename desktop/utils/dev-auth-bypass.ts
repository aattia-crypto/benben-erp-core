import {
  PERMISSION_KEYS,
  type PermissionMap,
} from "../services/permissions.types";

export const DEV_BYPASS_TOKEN = "dev-bypass-token";
export const DEV_BYPASS_USER_ID = "dev-admin-user";

/** Dev-only auth shortcut — safe in preload (no main-process electron APIs). */
export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function isDevBypassToken(token: string | null | undefined): boolean {
  return isDevAuthBypassEnabled() && token === DEV_BYPASS_TOKEN;
}

export function devBypassPermissionMap(): PermissionMap {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionMap;
}

export function devBypassAuthContext(): { userId: string; permissions: PermissionMap; role: string } {
  return {
    userId: DEV_BYPASS_USER_ID,
    permissions: devBypassPermissionMap(),
    role: "admin",
  };
}

export function devBypassSessionDto() {
  const now = new Date().toISOString();
  return {
    userId: DEV_BYPASS_USER_ID,
    username: "admin",
    name: "Dev Administrator",
    orgId: "default",
    orgName: "Dev Company",
    role: "admin",
    roleLabel: "Admin",
    department: "Admin",
    startedAt: now,
    mustChangePassword: false,
    passwordResetRequired: false,
    permissions: devBypassPermissionMap(),
  };
}
