import type { PermissionMap } from "../services/permissions.types";
import { PERMISSION_KEYS } from "../services/permissions.types";
import { isDemoBuild } from "./build-flavor";
import {
  DEV_BYPASS_TOKEN,
  devBypassAuthContext,
  devBypassSessionDto,
  isDevAuthBypassEnabled,
  isDevBypassToken,
} from "./dev-auth-bypass";

export const DEMO_BYPASS_TOKEN = "demo-presenter-token";
export const DEMO_BYPASS_USER_ID = "demo-presenter-user";
export const DEMO_BYPASS_USERNAME = "presenter";
export const DEMO_COMPANY_NAME = "Summit Industrial Demo Co.";

export function isPresenterAuthBypassEnabled(): boolean {
  return isDevAuthBypassEnabled() || isDemoBuild();
}

export function getPresenterBypassToken(): string {
  return isDevAuthBypassEnabled() ? DEV_BYPASS_TOKEN : DEMO_BYPASS_TOKEN;
}

export function isPresenterBypassToken(token: string | null | undefined): boolean {
  if (isDevBypassToken(token)) return true;
  return isDemoBuild() && token === DEMO_BYPASS_TOKEN;
}

function demoBypassPermissionMap(): PermissionMap {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionMap;
}

export function presenterBypassAuthContext(): {
  userId: string;
  permissions: PermissionMap;
  role: string;
} {
  if (isDemoBuild() && !isDevAuthBypassEnabled()) {
    return {
      userId: DEMO_BYPASS_USER_ID,
      permissions: demoBypassPermissionMap(),
      role: "admin",
    };
  }
  return devBypassAuthContext();
}

export function presenterBypassSessionDto() {
  if (isDemoBuild() && !isDevAuthBypassEnabled()) {
    const now = new Date().toISOString();
    return {
      userId: DEMO_BYPASS_USER_ID,
      username: DEMO_BYPASS_USERNAME,
      name: "Demo Presenter",
      orgId: "default",
      orgName: DEMO_COMPANY_NAME,
      role: "admin",
      roleLabel: "Admin",
      department: "Admin",
      startedAt: now,
      mustChangePassword: false,
      passwordResetRequired: false,
      permissions: demoBypassPermissionMap(),
    };
  }
  return devBypassSessionDto();
}