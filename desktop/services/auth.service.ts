import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

import { getPrisma } from "./database";
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from "./database-seed.service";
import { logger } from "../utils/logger";
import { ensureOrgRoles, normalizeRoleKey, resolveUserPermissions, createUserWithRole } from "./permissions.service";
import type { PermissionMap } from "./permissions.types";
import { presenterBypassSessionDto, isPresenterBypassToken } from "../utils/presenter-auth-bypass";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

export interface AuthSessionDto {
  userId: string;
  username: string;
  name: string;
  orgId: string;
  orgName: string;
  role: string;
  roleLabel?: string;
  department: string;
  startedAt: string;
  mustChangePassword: boolean;
  passwordResetRequired: boolean;
  permissions: PermissionMap;
}

export interface LoginResult {
  session: AuthSessionDto;
  token: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function requiresPasswordReset(username: string, password: string, mustChangePassword: boolean): boolean {
  if (mustChangePassword) return true;
  return (
    normalizeUsername(username) === DEFAULT_ADMIN_USERNAME &&
    password === DEFAULT_ADMIN_PASSWORD
  );
}

async function toSessionDto(
  user: {
    id: string;
    username: string;
    displayName: string | null;
    orgId: string;
    role: string;
    permissionsOverride: string | null;
    mustChangePassword: boolean;
  },
  orgName: string,
  startedAt: Date,
  passwordResetRequired: boolean,
): Promise<AuthSessionDto> {
  await ensureOrgRoles(user.orgId);
  const permissions = await resolveUserPermissions(user);
  const db = getPrisma();
  const roleRow = await db.orgRole.findUnique({
    where: { orgId_id: { orgId: user.orgId, id: user.role } },
  });
  return {
    userId: user.id,
    username: user.username,
    name: user.displayName ?? user.username,
    orgId: user.orgId,
    orgName,
    role: user.role,
    roleLabel: roleRow?.label ?? user.role,
    department: roleRow?.category ?? "Admin",
    startedAt: startedAt.toISOString(),
    mustChangePassword: passwordResetRequired,
    passwordResetRequired,
    permissions,
  };
}

async function resolveOrgName(orgId: string): Promise<string> {
  const settings = await getPrisma().settings.findFirst({
    where: { orgId },
    select: { companyName: true },
  });
  return settings?.companyName ?? "My Company";
}

async function writeAudit(
  action: string,
  orgId: string,
  userId: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await getPrisma().auditLog.create({
    data: {
      orgId,
      userId,
      action,
      entityType: "auth",
      detail: detail ? JSON.stringify(detail) : undefined,
    },
  });
}

export async function initializeAdmin(input: {
  username: string;
  password: string;
  companyName: string;
}): Promise<{ ok: true; data: LoginResult } | { ok: false; error: string }> {
  const username = normalizeUsername(input.username);
  if (!username) return { ok: false, error: "Administrator username is required." };
  if (!input.password || input.password.length < 8) {
    return { ok: false, error: "Admin password must be at least 8 characters." };
  }

  const db = getPrisma();
  const orgId = "default";
  const companyName = input.companyName.trim() || "My Company";
  await ensureOrgRoles(orgId);

  const previousUsernames = (
    await db.user.findMany({ select: { username: true } })
  ).map((u) => u.username);
  const hadExistingUsers = previousUsernames.length > 0;

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await db.$transaction(async (tx) => {
    await tx.session.deleteMany();
    await tx.user.deleteMany();
    return tx.user.create({
      data: {
        username,
        passwordHash,
        displayName: "Administrator",
        role: "admin",
        orgId,
        mustChangePassword: false,
        isActive: true,
      },
    });
  });

  if (hadExistingUsers) {
    logger.info("First-time setup replaced existing user accounts", {
      previousUsernames,
      newUsername: username,
    });
  }

  await db.settings.upsert({
    where: { id: "default" },
    create: { id: "default", orgId, companyName },
    update: { companyName, orgId },
  });

  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  await writeAudit(
    hadExistingUsers ? "AUTH_REPLACE_BOOTSTRAP_ADMIN" : "AUTH_INITIALIZE_ADMIN",
    orgId,
    user.id,
    {
      username,
      ...(hadExistingUsers ? { replacedUsernames: previousUsernames } : {}),
    },
  );

  const session = await toSessionDto(user, companyName, new Date(), false);
  logger.info("Desktop admin initialized", { username });
  return { ok: true, data: { session, token } };
}

export type ProvisionUserInput = {
  username: string;
  tempPassword: string;
  displayName: string;
  orgId: string;
  roleId: string;
  permissionsOverride?: Partial<PermissionMap> | null;
  employeeId?: string | null;
};

export type ProvisionUserResult = {
  userId: string;
  username: string;
  name: string;
  orgId: string;
  roleId: string;
};

/**
 * Atomically creates a system user with enterprise role + permission overrides in one transaction.
 */
export async function provisionSystemUser(
  input: ProvisionUserInput,
): Promise<{ ok: true; data: ProvisionUserResult } | { ok: false; error: string }> {
  const username = normalizeUsername(input.username);
  if (!username) return { ok: false, error: "Username is required." };
  if (!input.tempPassword || input.tempPassword.length < 6) {
    return { ok: false, error: "Temporary password must be at least 6 characters." };
  }
  const displayName = input.displayName.trim() || username;
  const orgId = input.orgId.trim() || "default";
  const roleId = normalizeRoleKey(input.roleId);

  const db = getPrisma();
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) return { ok: false, error: "An account with that username already exists." };

  await ensureOrgRoles(orgId);
  const roleRow = await db.orgRole.findUnique({
    where: { orgId_id: { orgId, id: roleId } },
  });
  if (!roleRow) return { ok: false, error: `Unknown enterprise role: ${roleId}` };

  const passwordHash = await bcrypt.hash(input.tempPassword, BCRYPT_ROUNDS);

  try {
    const { userId } = await createUserWithRole({
      username,
      passwordHash,
      displayName,
      orgId,
      roleId,
      permissionsOverride: input.permissionsOverride ?? null,
      mustChangePassword: true,
      employeeId: input.employeeId ?? null,
    });

    await writeAudit("AUTH_USER_PROVISIONED", orgId, userId, {
      username,
      roleId,
      employeeId: input.employeeId ?? null,
      hasOverrides: !!input.permissionsOverride,
    });

    logger.info("System user provisioned", { userId, username, roleId });
    return {
      ok: true,
      data: {
        userId,
        username,
        name: displayName,
        orgId,
        roleId,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("provisionSystemUser failed", { username, error: message });
    return { ok: false, error: message };
  }
}

export async function login(
  username: string,
  password: string,
): Promise<{ ok: true; data: LoginResult } | { ok: false; error: string }> {
  const norm = normalizeUsername(username);
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { username: norm } });

  if (!user || !user.isActive) {
    return { ok: false, error: "Invalid username or password." };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Invalid username or password." };

  const passwordResetRequired = requiresPasswordReset(user.username, password, user.mustChangePassword);
  const orgName = await resolveOrgName(user.orgId);
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.session.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  await writeAudit("AUTH_LOGIN", user.orgId, user.id, {
    username: norm,
    passwordResetRequired,
  });

  return {
    ok: true,
    data: {
      session: await toSessionDto(user, orgName, new Date(), passwordResetRequired),
      token,
    },
  };
}

export async function changePassword(
  token: string | null,
  newPassword: string,
  currentPassword?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "Not signed in." };
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }

  const db = getPrisma();
  const row = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date() || !row.user.isActive) {
    return { ok: false, error: "Session expired or invalid." };
  }

  const user = row.user;
  if (!user.mustChangePassword) {
    if (!currentPassword) return { ok: false, error: "Current password is required." };
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
  }

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    return { ok: false, error: "New password must differ from the current one." };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  await writeAudit("AUTH_PASSWORD_CHANGED", user.orgId, user.id);
  return { ok: true };
}

/**
 * Admin sets a new temporary password for another user. Forces change on next sign-in
 * and revokes all active sessions for the target account.
 */
export async function adminResetUserPassword(
  actorUserId: string,
  targetUserId: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actorUserId === targetUserId) {
    return {
      ok: false,
      error: "Use Settings or Change Password to update your own password while signed in.",
    };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }

  const db = getPrisma();
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) return { ok: false, error: "User not found." };
  if (!target.isActive) return { ok: false, error: "Cannot reset password for an inactive account." };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.session.deleteMany({ where: { userId: targetUserId } });
  await db.user.update({
    where: { id: targetUserId },
    data: { passwordHash, mustChangePassword: true },
  });

  await writeAudit("AUTH_ADMIN_PASSWORD_RESET", target.orgId, actorUserId, {
    targetUserId,
    targetUsername: target.username,
  });

  logger.info("Admin reset user password", {
    actorUserId,
    targetUserId,
    username: target.username,
  });
  return { ok: true };
}

export async function logout(token: string | null): Promise<{ ok: true }> {
  if (!token) return { ok: true };

  const db = getPrisma();
  const tokenHash = hashToken(token);
  const row = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (row) {
    await db.session.delete({ where: { id: row.id } });
    await writeAudit("AUTH_LOGOUT", row.user.orgId, row.userId);
  }

  return { ok: true };
}

export async function getSession(
  token: string | null,
): Promise<{ ok: true; data: AuthSessionDto | null } | { ok: false; error: string }> {
  if (!token) return { ok: true, data: null };
  if (isPresenterBypassToken(token)) return { ok: true, data: presenterBypassSessionDto() };

  const db = getPrisma();
  const row = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!row || row.expiresAt < new Date() || !row.user.isActive) {
    if (row) await db.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return { ok: true, data: null };
  }

  const orgName = await resolveOrgName(row.user.orgId);
  const passwordResetRequired = row.user.mustChangePassword;
  return {
    ok: true,
    data: await toSessionDto(row.user, orgName, row.createdAt, passwordResetRequired),
  };
}
