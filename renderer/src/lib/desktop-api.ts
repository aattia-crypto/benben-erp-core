/**
 * Thin bridge to the Electron preload API (window.benben).
 * Keeps desktop-specific I/O out of business modules.
 */
import type { DesktopAuthSessionDto } from "./desktop-types";
import type { Session, User, Department, AuthRole } from "./auth-store";
import { syncPermissionsFromSession, clearStoredPermissions } from "./permissions-store";

export function isDesktopAuth(): boolean {
  return typeof window !== "undefined" && !!window.benben?.auth;
}

function toLegacySession(dto: DesktopAuthSessionDto): Session {
  return {
    userId: dto.userId,
    username: dto.username,
    name: dto.name,
    orgId: dto.orgId,
    orgName: dto.orgName,
    startedAt: dto.startedAt,
  };
}

function toLegacyUser(dto: DesktopAuthSessionDto): User {
  return {
    id: dto.userId,
    username: dto.username,
    name: dto.name,
    passwordHash: "",
    orgId: dto.orgId,
    orgName: dto.orgName,
    department: (dto.department as Department) || "Admin",
    role: (dto.role as AuthRole) || "admin",
    must_change_password: dto.mustChangePassword,
    createdAt: dto.startedAt,
  };
}

/** Maps desktop session into shapes the existing auth-store consumers expect. */
export function mapDesktopSession(dto: DesktopAuthSessionDto): {
  session: Session;
  user: User;
  mustChange: boolean;
} {
  syncPermissionsFromSession(dto);
  return {
    session: toLegacySession(dto),
    user: toLegacyUser(dto),
    mustChange: dto.mustChangePassword,
  };
}

export async function desktopLogin(
  username: string,
  password: string,
): Promise<
  | { ok: true; session: Session; user: User; mustChange: boolean }
  | { ok: false; error: string }
> {
  const api = window.benben?.auth;
  if (!api) return { ok: false, error: "Desktop auth is not available." };

  const res = await api.login(username, password);
  if (!res.ok) return { ok: false, error: res.error ?? "Login failed." };
  const mapped = mapDesktopSession(res.data.session);
  const token = (res as { token?: string }).token ?? api.getSessionToken?.() ?? null;
  if (token) {
    persistSessionToken(token);
    syncPreloadSessionToken(token, mapped.session.orgId);
  }
  return { ok: true, ...mapped };
}

export async function desktopInitializeAdmin(input: {
  username: string;
  password: string;
  companyName: string;
}): Promise<
  | { ok: true; session: Session; user: User }
  | { ok: false; error: string }
> {
  const api = window.benben?.auth;
  if (!api) return { ok: false, error: "Desktop auth is not available." };

  const res = await api.initializeAdmin(input);
  if (!res.ok) return { ok: false, error: res.error ?? "Setup failed." };
  const mapped = mapDesktopSession(res.data.session);
  const token = (res as { token?: string }).token ?? api.getSessionToken?.() ?? null;
  if (token) {
    persistSessionToken(token);
    syncPreloadSessionToken(token, mapped.session.orgId);
  }
  return { ok: true, session: mapped.session, user: mapped.user };
}

export async function desktopLogout(): Promise<void> {
  await window.benben?.auth.logout();
  persistSessionToken(null);
  syncPreloadSessionToken(null);
  clearStoredPermissions();
}

export async function desktopGetSession(): Promise<DesktopAuthSessionDto | null> {
  const api = window.benben?.auth;
  if (!api) return null;
  const res = await api.getSession();
  if (!res.ok || !res.data) return null;
  return res.data;
}

export function isDesktopShell(): boolean {
  if (typeof window === "undefined") return false;
  if (window.benben) return true;
  return window.__BENBEN_DESKTOP_SHELL__ === true;
}

const SESSION_TOKEN_KEY = "benben.session.token.v1";

export function readStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function persistSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) localStorage.removeItem(SESSION_TOKEN_KEY);
  else localStorage.setItem(SESSION_TOKEN_KEY, token);
}

/** Re-seed the preload IPC auth token after a full window reload. */
export function syncPreloadSessionToken(token?: string | null, orgId?: string | null): void {
  const api = window.benben?.auth;
  if (!api?.restoreSessionToken) return;
  api.restoreSessionToken(token ?? readStoredSessionToken(), orgId ?? null);
}

export function capturePreloadSessionToken(orgId?: string | null): void {
  const token = window.benben?.auth?.getSessionToken?.() ?? null;
  persistSessionToken(token);
  if (token) syncPreloadSessionToken(token, orgId);
}

export async function desktopPickFolder(): Promise<string | null> {
  const res = await window.benben?.dialog.pickFolder();
  if (!res?.ok) return null;
  return res.data ?? null;
}

export async function desktopPickFile(
  filters?: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const res = await window.benben?.dialog.pickFile(filters);
  if (!res?.ok) return null;
  return res.data ?? null;
}

export async function desktopValidatePath(
  targetPath: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const res = await window.benben?.dialog.validatePath(targetPath);
  if (!res?.ok) return { ok: false, error: res?.error ?? "Validation failed." };
  if (!res.data?.path) return { ok: false, error: "Invalid path." };
  return { ok: true, path: res.data.path };
}

export async function desktopProvisionUser(input: {
  username: string;
  tempPassword: string;
  displayName: string;
  orgId: string;
  orgName: string;
  roleId: string;
  permissionsOverride?: Record<string, boolean> | null;
  employeeId?: string | null;
}): Promise<
  | {
      ok: true;
      user: User;
    }
  | { ok: false; error: string }
> {
  const api = window.benben?.auth;
  if (!api?.provisionUser) return { ok: false, error: "Desktop user provisioning is not available." };

  const res = await api.provisionUser(input);
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? "Provisioning failed." };

  const user: User = {
    id: res.data.userId,
    username: res.data.username,
    name: res.data.name,
    passwordHash: "",
    orgId: res.data.orgId,
    orgName: input.orgName,
    department: "Admin",
    role: res.data.roleId as AuthRole,
    must_change_password: true,
    createdAt: new Date().toISOString(),
  };
  return { ok: true, user };
}
