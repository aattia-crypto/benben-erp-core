import type { Session, User } from "./auth-store";
import type { DesktopAuthSessionDto } from "./desktop-types";
import { lanApiFetch, setLanToken } from "./lan-api-client";
import { syncPermissionsFromSession, clearStoredPermissions } from "./permissions-store";
import { setWorkspace, isWorkspaceInitialized } from "./workspace-store";

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
    department: (dto.department as User["department"]) || "Admin",
    role: dto.role === "admin" ? "admin" : "user",
    must_change_password: dto.mustChangePassword,
    createdAt: dto.startedAt,
  };
}

function applyLanSession(dto: DesktopAuthSessionDto, token: string): {
  session: Session;
  user: User;
  mustChange: boolean;
} {
  setLanToken(token);
  syncPermissionsFromSession(dto);
  if (!isWorkspaceInitialized()) setWorkspace(dto.orgName);
  return {
    session: toLegacySession(dto),
    user: toLegacyUser(dto),
    mustChange: dto.mustChangePassword,
  };
}

export async function lanLogin(
  username: string,
  password: string,
): Promise<
  | { ok: true; session: Session; user: User; mustChange: boolean }
  | { ok: false; error: string }
> {
  try {
    const res = await lanApiFetch<{
      token: string;
      session: DesktopAuthSessionDto;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      auth: false,
    });
    const mapped = applyLanSession(res.session, res.token);
    return { ok: true, ...mapped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function lanGetSession(): Promise<DesktopAuthSessionDto | null> {
  const token = (await import("./lan-api-client")).getLanToken();
  if (!token) return null;
  try {
    const res = await lanApiFetch<{ session: DesktopAuthSessionDto }>("/api/auth/session");
    if (!res.session) {
      setLanToken(null);
      return null;
    }
    return res.session;
  } catch {
    setLanToken(null);
    return null;
  }
}

export async function lanChangePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await lanApiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ newPassword, currentPassword }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function lanLogout(): Promise<void> {
  try {
    await lanApiFetch("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    /* best-effort */
  }
  setLanToken(null);
  clearStoredPermissions();
}

export function mapLanSession(dto: DesktopAuthSessionDto): {
  session: Session;
  user: User;
  mustChange: boolean;
} {
  syncPermissionsFromSession(dto);
  if (!isWorkspaceInitialized()) setWorkspace(dto.orgName);
  return {
    session: toLegacySession(dto),
    user: toLegacyUser(dto),
    mustChange: dto.mustChangePassword,
  };
}
