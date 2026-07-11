/**
 * Presenter Mode packaged demo build auto-login.
 * Active only when main injects window.__BENBEN_DEMO_BUILD__.
 */
import { ADMIN_ALL_PERMISSIONS } from "./permissions-constants";
import { syncPermissionsFromSession } from "./permissions-store";
import { markOnboardingComplete } from "./org-profile";
import { isWorkspaceInitialized, setWorkspace } from "./workspace-store";
import { syncDesktopAuthShadow, type Session, type User } from "./auth-store";

export const DEMO_BYPASS_TOKEN = "demo-presenter-token";
export const DEMO_BYPASS_USERNAME = "presenter";
export const DEMO_COMPANY_NAME = "Summit Industrial Demo Co.";

const DEMO_USER_ID = "demo-presenter-user";
const DEMO_ORG_ID = "default";

export function isDemoBuild(): boolean {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_BENBEN_DEMO_BUILD === "true";
  }
  return (
    window.__BENBEN_DEMO_BUILD__ === true ||
    import.meta.env.VITE_BENBEN_DEMO_BUILD === "true" ||
    // Preload may expose the flag as a bridged boolean property.
    (window as Window & { __BENBEN_DEMO_BUILD__?: unknown }).__BENBEN_DEMO_BUILD__ === true
  );
}

export function isPresenterAutoLogin(): boolean {
  return import.meta.env.DEV || isDemoBuild();
}

export function applyDemoPresenterSession(): void {
  if (!isDemoBuild() || typeof window === "undefined") return;

  const now = new Date().toISOString();
  const user: User = {
    id: DEMO_USER_ID,
    username: DEMO_BYPASS_USERNAME,
    name: "Demo Presenter",
    passwordHash: "",
    orgId: DEMO_ORG_ID,
    orgName: DEMO_COMPANY_NAME,
    department: "Admin",
    role: "admin",
    must_change_password: false,
    createdAt: now,
  };
  const session: Session = {
    userId: DEMO_USER_ID,
    username: DEMO_BYPASS_USERNAME,
    name: user.name,
    orgId: DEMO_ORG_ID,
    orgName: user.orgName,
    startedAt: now,
  };

  syncDesktopAuthShadow(session, user);
  syncPermissionsFromSession({
    userId: DEMO_USER_ID,
    username: DEMO_BYPASS_USERNAME,
    name: user.name,
    orgId: DEMO_ORG_ID,
    orgName: DEMO_COMPANY_NAME,
    role: "admin",
    department: "Admin",
    startedAt: now,
    mustChangePassword: false,
    passwordResetRequired: false,
    permissions: ADMIN_ALL_PERMISSIONS,
  });

  if (!isWorkspaceInitialized()) {
    setWorkspace(DEMO_COMPANY_NAME);
  }
  markOnboardingComplete();
  localStorage.setItem("benben.migration.completed.v1", now);

  // Lazy: avoid circular import at module top — seed after session is applied.
  void import("./operations-hydrate").then(({ seedAllDemoStoresNow }) => {
    seedAllDemoStoresNow();
  });
}