/**
 * Development-only auth shortcut for `npm run dev` (Vite + Electron shell).
 * Never active in production builds (`import.meta.env.DEV` is false).
 */
import { ADMIN_ALL_PERMISSIONS } from "./permissions-constants";
import { syncPermissionsFromSession } from "./permissions-store";
import { markOnboardingComplete } from "./org-profile";
import { isWorkspaceInitialized, setWorkspace } from "./workspace-store";
import { syncDesktopAuthShadow, type Session, type User } from "./auth-store";

export const DEV_BYPASS_TOKEN = "dev-bypass-token";
export const DEV_BYPASS_USERNAME = "admin";

const DEV_USER_ID = "dev-admin-user";
const DEV_ORG_ID = "default";

export function isDevAuthBypass(): boolean {
  return import.meta.env.DEV;
}

/** Seeds a fully authenticated local admin session for development. */
export function applyDevAuthBypass(): void {
  if (!isDevAuthBypass() || typeof window === "undefined") return;

  const now = new Date().toISOString();
  const user: User = {
    id: DEV_USER_ID,
    username: DEV_BYPASS_USERNAME,
    name: "Dev Administrator",
    passwordHash: "",
    orgId: DEV_ORG_ID,
    orgName: "Dev Company",
    department: "Admin",
    role: "admin",
    must_change_password: false,
    createdAt: now,
  };
  const session: Session = {
    userId: DEV_USER_ID,
    username: DEV_BYPASS_USERNAME,
    name: user.name,
    orgId: DEV_ORG_ID,
    orgName: user.orgName,
    startedAt: now,
  };

  syncDesktopAuthShadow(session, user);
  syncPermissionsFromSession({
    userId: DEV_USER_ID,
    username: DEV_BYPASS_USERNAME,
    name: user.name,
    orgId: DEV_ORG_ID,
    orgName: user.orgName,
    role: "admin",
    department: "Admin",
    startedAt: now,
    mustChangePassword: false,
    passwordResetRequired: false,
    permissions: ADMIN_ALL_PERMISSIONS,
  });

  if (!isWorkspaceInitialized()) {
    setWorkspace("Dev Company");
  }
  markOnboardingComplete();
  localStorage.setItem("benben.migration.completed.v1", now);
}
