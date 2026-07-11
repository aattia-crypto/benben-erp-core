// Local-first auth store. Sessions and accounts persist to localStorage.
// Each account is bound to a workspace (organization) so app data is
// natively isolated per company deployment.
//
// In Electron, auth IPC is the source of truth; a shadow copy is kept in
// localStorage so existing UI code continues to work without refactors.

import {
  desktopGetSession,
  desktopLogout,
  isDesktopAuth,
  persistSessionToken,
  readStoredSessionToken,
  syncPreloadSessionToken,
  capturePreloadSessionToken,
} from "./desktop-api";
import { isDevAuthBypass, applyDevAuthBypass, DEV_BYPASS_TOKEN } from "./dev-auth-bypass";
import {
  applyDemoPresenterSession,
  DEMO_BYPASS_TOKEN,
  isDemoBuild,
  isPresenterAutoLogin,
} from "./demo-build";
import { isLanMode, isRemoteAuth } from "./lan-mode";
import { lanGetSession, lanLogout, mapLanSession } from "./lan-auth";
import { randomUUID } from "./uuid";
import { canManageUsers } from "./permissions-store";

const USERS_KEY = "benben.users.v1";
const SESSION_KEY = "benben.session.v1";
const RESET_KEY = "benben.password_resets.v1";

export type Department =
  | "Admin"
  | "Sales"
  | "Finance"
  | "HR"
  | "Purchasing"
  | "Warehouse"
  | "Inventory"
  | "Operations";

export const DEPARTMENTS: Department[] = [
  "Admin",
  "Sales",
  "Finance",
  "HR",
  "Purchasing",
  "Warehouse",
  "Inventory",
  "Operations",
];

export type AuthRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  orgId: string;            // workspace_id
  orgName: string;
  department: Department;
  role: AuthRole;
  must_change_password: boolean;
  isActive?: boolean;
  createdAt: string;
}

export interface Session {
  userId: string;
  username: string;
  name: string;
  orgId: string;
  orgName: string;
  startedAt: string;
}

function read<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(k: string, v: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(v));
}

// Lightweight non-cryptographic hash for the demo. NOT for production secrets.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0") + s.length.toString(16);
}

function genOrgId(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20) || "org";
  const rand = Math.random().toString(36).slice(2, 8);
  return `org_${slug}_${rand}`;
}

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function readUsers(): User[] {
  return read<User[]>(USERS_KEY, []).map(migrate);
}
function writeUsers(u: User[]) { write(USERS_KEY, u); }

// Backfill missing fields on legacy records.
function migrate(u: any): User {
  return {
    id: u.id,
    username: (u.username ?? u.email ?? "").trim().toLowerCase(),
    name: u.name,
    passwordHash: u.passwordHash,
    orgId: u.orgId,
    orgName: u.orgName,
    department: u.department ?? "Admin",
    role: u.role ?? "admin",
    must_change_password: !!u.must_change_password,
    createdAt: u.createdAt,
  };
}

// ---- First-Time Initialization --------------------------------------------
// No automatic seeding. The Initial Setup screen calls initializeAdmin()
// once, which creates the first Administrator account tied to the company
// workspace. Kept as a no-op for legacy callers.
export function ensureAdminSeed() { /* no-op — replaced by initializeAdmin() */ }

/** Sync desktop session into localStorage for legacy consumers (getSession, getCurrentUser). */
export function syncDesktopAuthShadow(session: Session, user: User): void {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) users[idx] = { ...users[idx], ...user, passwordHash: users[idx].passwordHash || "" };
  else users.push(user);
  writeUsers(users);
  write(SESSION_KEY, session);
  if (typeof window !== "undefined") localStorage.removeItem("benben.acting_role.v1");
  emit();
}

export async function hydrateDesktopSession(): Promise<void> {
  if (isDesktopAuth()) {
    const dto = await desktopGetSession();
    if (!dto) {
      if (typeof window !== "undefined") {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem("benben.acting_role.v1");
      }
      emit();
      return;
    }
    const { session, user } = await import("./desktop-api").then((m) =>
      m.mapDesktopSession(dto),
    );
    syncDesktopAuthShadow(session, user);
    return;
  }

  if (isLanMode()) {
    const dto = await lanGetSession();
    if (!dto) {
      if (typeof window !== "undefined") {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem("benben.acting_role.v1");
      }
      emit();
      return;
    }
    const { session, user } = mapLanSession(dto);
    syncDesktopAuthShadow(session, user);
  }
}

let authBootstrapDone = false;
let authBootstrapPromise: Promise<void> | null = null;

/** Resolves after desktop session is reconciled (call before auth redirects). */
export function whenAuthReady(): Promise<void> {
  if (authBootstrapDone) return Promise.resolve();
  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      try {
        if (isDemoBuild()) {
          applyDemoPresenterSession();
          persistSessionToken(DEMO_BYPASS_TOKEN);
          syncPreloadSessionToken(DEMO_BYPASS_TOKEN, "default");
          return;
        }
        if (isDevAuthBypass()) {
          applyDevAuthBypass();
          persistSessionToken(DEV_BYPASS_TOKEN);
          syncPreloadSessionToken(DEV_BYPASS_TOKEN, "default");
          return;
        }
        if (typeof window !== "undefined" && isRemoteAuth()) {
          const storedToken = readStoredSessionToken();
          if (storedToken) {
            syncPreloadSessionToken(storedToken, getSession()?.orgId ?? null);
          }
          await Promise.race([
            hydrateDesktopSession(),
            new Promise<void>((resolve) => setTimeout(resolve, 8000)),
          ]);
          capturePreloadSessionToken(getSession()?.orgId ?? null);
        }
      } catch {
        /* never block UI boot on session hydration */
      } finally {
        authBootstrapDone = true;
      }
    })();
  }
  return authBootstrapPromise;
}

if (typeof window !== "undefined" && (isRemoteAuth() || isPresenterAutoLogin())) {
  void whenAuthReady();
}

export function initializeAdmin(input: {
  username: string;
  password: string;
  companyName: string;
}): { ok: true; user: User } | { ok: false; error: string } {
  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: "Administrator username is required." };
  if (!input.password || input.password.length < 8)
    return { ok: false, error: "Admin password must be at least 8 characters." };

  const users = readUsers();
  if (users.some((u) => u.username === username))
    return { ok: false, error: "An account with that username already exists." };

  const orgId = genOrgId(input.companyName);
  const user: User = {
    id: randomUUID(),
    username,
    name: "Administrator",
    passwordHash: hash(input.password),
    orgId,
    orgName: input.companyName.trim() || "My Company",
    department: "Admin",
    role: "admin",
    must_change_password: false,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  emit();
  return { ok: true, user };
}

/** Desktop path — use from setup when running inside Electron. */
export async function initializeAdminAsync(input: {
  username: string;
  password: string;
  companyName: string;
}): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const { desktopInitializeAdmin, isDesktopAuth: isDesktop } = await import("./desktop-api");
  if (!isDesktop()) return initializeAdmin(input);
  const res = await desktopInitializeAdmin(input);
  if (!res.ok) return res;
  syncDesktopAuthShadow(res.session, res.user);
  return { ok: true, user: res.user };
}

export function getSession(): Session | null {
  const raw = read<Session | null>(SESSION_KEY, null);
  if (!raw) return null;
  return {
    ...raw,
    username: (raw.username ?? (raw as { email?: string }).email ?? "").trim().toLowerCase(),
  };
}

export function getCurrentUser(): User | null {
  const s = getSession();
  if (!s) return null;
  return readUsers().find((u) => u.id === s.userId) ?? null;
}

export function listUsersInWorkspace(orgId: string): User[] {
  return readUsers().filter((u) => u.orgId === orgId);
}

export function register(input: {
  username: string;
  password: string;
  name: string;
  orgName: string;
}): { ok: true; session: Session } | { ok: false; error: string } {
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password || input.password.length < 6)
    return { ok: false, error: "Provide a username and a password (6+ characters)." };
  const users = readUsers();
  if (users.some((u) => u.username === username))
    return { ok: false, error: "An account with that username already exists." };
  const orgId = genOrgId(input.orgName || input.name);
  const user: User = {
    id: randomUUID(),
    username,
    name: input.name.trim() || username,
    passwordHash: hash(input.password),
    orgId,
    orgName: input.orgName.trim() || "My Organization",
    department: "Admin",
    role: "admin", // first user of a workspace is its admin
    must_change_password: false,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  const session: Session = {
    userId: user.id, username: user.username, name: user.name,
    orgId: user.orgId, orgName: user.orgName,
    startedAt: new Date().toISOString(),
  };
  write(SESSION_KEY, session);
  emit();
  return { ok: true, session };
}

export function login(
  username: string, password: string,
): { ok: true; session: Session; mustChange: boolean } | { ok: false; error: string } {
  ensureAdminSeed();
  const users = readUsers();
  const u = users.find((x) => x.username === username.trim().toLowerCase());
  if (!u || u.passwordHash !== hash(password))
    return { ok: false, error: "Invalid username or password." };
  const session: Session = {
    userId: u.id, username: u.username, name: u.name,
    orgId: u.orgId, orgName: u.orgName,
    startedAt: new Date().toISOString(),
  };
  write(SESSION_KEY, session);
  // Always start a fresh session in the user's real role — never inherit a previous preview.
  if (typeof window !== "undefined") localStorage.removeItem("benben.acting_role.v1");
  emit();
  return { ok: true, session, mustChange: u.must_change_password };
}

/** Desktop path — use from login when running inside Electron. */
export async function loginAsync(
  username: string,
  password: string,
): Promise<
  | { ok: true; session: Session; mustChange: boolean }
  | { ok: false; error: string }
> {
  if (isLanMode()) {
    const { lanLogin } = await import("./lan-auth");
    const res = await lanLogin(username, password);
    if (!res.ok) return res;
    syncDesktopAuthShadow(res.session, res.user);
    return { ok: true, session: res.session, mustChange: res.mustChange };
  }
  const { desktopLogin, isDesktopAuth: isDesktop } = await import("./desktop-api");
  if (!isDesktop()) return login(username, password);
  const res = await desktopLogin(username, password);
  if (!res.ok) return res;
  syncDesktopAuthShadow(res.session, res.user);
  capturePreloadSessionToken(res.session.orgId);
  return { ok: true, session: res.session, mustChange: res.mustChange };
}

export function logout() {
  if (isDesktopAuth()) void desktopLogout();
  if (isLanMode()) void lanLogout();
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("benben.acting_role.v1");
    persistSessionToken(null);
    syncPreloadSessionToken(null);
  }
  emit();
}

// ---- Admin: create employee account ---------------------------------------
export function adminCreateUser(input: {
  name: string;
  username: string;
  department: Department;
  tempPassword: string;
}): { ok: true; user: User } | { ok: false; error: string } {
  const session = getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canManageUsers())
    return { ok: false, error: "Only admins can create users." };

  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: "Username is required." };
  if (!input.tempPassword || input.tempPassword.length < 6)
    return { ok: false, error: "Temporary password must be at least 6 characters." };

  const users = readUsers();
  if (users.some((u) => u.username === username))
    return { ok: false, error: "An account with that username already exists." };

  const user: User = {
    id: randomUUID(),
    username,
    name: input.name.trim() || username,
    passwordHash: hash(input.tempPassword),
    orgId: session.orgId,
    orgName: session.orgName,
    department: input.department,
    role: "user",
    must_change_password: true,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  emit();
  return { ok: true, user };
}

/** Desktop path — atomic DB user + role provisioning (avoids assignUserRole race). */
export async function adminCreateUserAsync(input: {
  name: string;
  username: string;
  department: Department;
  tempPassword: string;
  orgId: string;
  orgName: string;
  roleId?: string;
  permissionsOverride?: Record<string, boolean> | null;
  employeeId?: string | null;
}): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const session = getSession();
  if (!session) return { ok: false, error: "Not signed in." };
  if (!canManageUsers())
    return { ok: false, error: "Only admins can create users." };

  const username = input.username.trim().toLowerCase();
  if (!username) return { ok: false, error: "Username is required." };
  if (!input.tempPassword || input.tempPassword.length < 6)
    return { ok: false, error: "Temporary password must be at least 6 characters." };

  const { desktopProvisionUser, isDesktopAuth: isDesktop } = await import("./desktop-api");
  if (!isDesktop()) return adminCreateUser(input);

  const res = await desktopProvisionUser({
    username: input.username,
    tempPassword: input.tempPassword,
    displayName: input.name.trim() || input.username,
    orgId: input.orgId,
    orgName: input.orgName,
    roleId: input.roleId ?? "warehouse_clerk",
    permissionsOverride: input.permissionsOverride ?? null,
    employeeId: input.employeeId ?? null,
  });
  if (!res.ok) return res;

  const user: User = {
    ...res.user,
    department: input.department,
    role: (input.roleId ?? "warehouse_clerk") as AuthRole,
  };
  const users = readUsers();
  users.push(user);
  writeUsers(users);
  emit();
  return { ok: true, user };
}

// ---- Change password (clears must_change_password) ------------------------
export function changePassword(
  newPassword: string, currentPassword?: string,
): { ok: true } | { ok: false; error: string } {
  const me = getCurrentUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!newPassword || newPassword.length < 8)
    return { ok: false, error: "New password must be at least 8 characters." };
  if (!me.must_change_password) {
    if (!currentPassword || hash(currentPassword) !== me.passwordHash)
      return { ok: false, error: "Current password is incorrect." };
  }
  if (hash(newPassword) === me.passwordHash)
    return { ok: false, error: "New password must differ from the current one." };
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === me.id);
  if (idx < 0) return { ok: false, error: "Account not found." };
  users[idx] = { ...users[idx], passwordHash: hash(newPassword), must_change_password: false };
  writeUsers(users);
  emit();
  return { ok: true };
}

/** Server-backed password change for Electron shell and LAN browsers. */
export async function changePasswordAsync(
  newPassword: string,
  currentPassword?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isLanMode()) {
    const { lanChangePassword } = await import("./lan-auth");
    const res = await lanChangePassword(newPassword, currentPassword);
    if (!res.ok) return res;
    const me = getCurrentUser();
    if (me) {
      const users = readUsers();
      const idx = users.findIndex((u) => u.id === me.id);
      if (idx >= 0) {
        users[idx] = { ...users[idx], must_change_password: false };
        writeUsers(users);
        emit();
      }
    }
    return { ok: true };
  }
  return changePassword(newPassword, currentPassword);
}

// ---- Password reset (local mock — no email provider) ----------------------
// In a real backend this would email a magic link. Locally we generate a
// short-lived temporary password the user can sign in with, after which they
// will be force-routed to /change-password (must_change_password = true).
interface ResetRecord { username: string; tempPassword: string; issuedAt: string; }

export function requestPasswordReset(
  username: string,
): { ok: true; tempPassword: string } | { ok: false; error: string } {
  ensureAdminSeed();
  const norm = username.trim().toLowerCase();
  const users = readUsers();
  const idx = users.findIndex((u) => u.username === norm);
  if (idx < 0) return { ok: false, error: "No account found with that username." };
  const tempPassword =
    "Reset-" + Math.random().toString(36).slice(2, 8) + "-" + Math.floor(Math.random() * 90 + 10);
  users[idx] = {
    ...users[idx],
    passwordHash: hash(tempPassword),
    must_change_password: true,
  };
  writeUsers(users);
  const log = read<ResetRecord[]>(RESET_KEY, []);
  log.push({ username: norm, tempPassword, issuedAt: new Date().toISOString() });
  write(RESET_KEY, log);
  emit();
  return { ok: true, tempPassword };
}
