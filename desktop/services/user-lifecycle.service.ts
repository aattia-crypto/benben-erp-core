/**
 * User account lifecycle — deactivate, delete (with audit-safe fallback).
 */
import { getPrisma } from "./database";
import { logActivity } from "./audit.service";
import { logger } from "../utils/logger";
import { ORG_DEFAULT } from "./finance/types";

export type OrgUserDto = {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export async function listOrgUsers(orgId = ORG_DEFAULT): Promise<OrgUserDto[]> {
  const db = getPrisma();
  const rows = await db.user.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.displayName ?? u.username,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function deactivateUserAccount(
  userId: string,
  actorUserId: string,
  orgId = ORG_DEFAULT,
): Promise<{ user: OrgUserDto }> {
  if (userId === actorUserId) {
    throw new Error("You cannot deactivate your own account while signed in.");
  }
  const db = getPrisma();
  const target = await db.user.findFirst({ where: { id: userId, orgId } });
  if (!target) throw new Error("User not found.");

  await db.session.deleteMany({ where: { userId } });
  const updated = await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await logActivity({
    orgId,
    userId: actorUserId,
    module: "ADMIN",
    action: "USER_DEACTIVATED",
    entityType: "User",
    entityId: userId,
    summary: `Deactivated ${target.username}`,
  });

  logger.info("User deactivated", { userId, actorUserId });
  return {
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.displayName ?? updated.username,
      role: updated.role,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

export async function reactivateUserAccount(
  userId: string,
  actorUserId: string,
  orgId = ORG_DEFAULT,
): Promise<{ user: OrgUserDto }> {
  const db = getPrisma();
  const target = await db.user.findFirst({ where: { id: userId, orgId } });
  if (!target) throw new Error("User not found.");

  const updated = await db.user.update({
    where: { id: userId },
    data: { isActive: true },
  });

  await logActivity({
    orgId,
    userId: actorUserId,
    module: "ADMIN",
    action: "USER_REACTIVATED",
    entityType: "User",
    entityId: userId,
    summary: `Reactivated ${target.username}`,
  });

  return {
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.displayName ?? updated.username,
      role: updated.role,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

export async function resetUserAccountPassword(
  userId: string,
  actorUserId: string,
  newPassword: string,
  orgId = ORG_DEFAULT,
): Promise<{ user: OrgUserDto }> {
  const db = getPrisma();
  const target = await db.user.findFirst({ where: { id: userId, orgId } });
  if (!target) throw new Error("User not found.");

  const { adminResetUserPassword } = await import("./auth.service");
  const result = await adminResetUserPassword(actorUserId, userId, newPassword);
  if (!result.ok) throw new Error(result.error);

  const updated = await db.user.findUniqueOrThrow({ where: { id: userId } });

  await logActivity({
    orgId,
    userId: actorUserId,
    module: "ADMIN",
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: userId,
    summary: `Admin reset password for ${target.username}`,
  });

  return {
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.displayName ?? updated.username,
      role: updated.role,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

export type DeleteUserResult =
  | { ok: true; deleted: true; userId: string }
  | { ok: true; deleted: false; deactivated: true; notice: string; user: OrgUserDto };

export async function deleteUserAccount(
  userId: string,
  actorUserId: string,
  orgId = ORG_DEFAULT,
): Promise<DeleteUserResult> {
  if (userId === actorUserId) {
    throw new Error("You cannot delete your own account while signed in.");
  }
  const db = getPrisma();
  const target = await db.user.findFirst({ where: { id: userId, orgId } });
  if (!target) throw new Error("User not found.");

  try {
    await db.session.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });

    await logActivity({
      orgId,
      userId: actorUserId,
      module: "ADMIN",
      action: "USER_DELETED",
      entityType: "User",
      entityId: userId,
      summary: `Hard-deleted ${target.username}`,
    });

    logger.info("User deleted", { userId, actorUserId });
    return { ok: true, deleted: true, userId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFkBlock =
      message.includes("Foreign key") ||
      message.includes("foreign key") ||
      message.includes("P2003") ||
      message.includes("constraint");

    if (!isFkBlock) throw err;

    const { user } = await deactivateUserAccount(userId, actorUserId, orgId);
    const notice =
      "Cannot hard-delete user due to historical audit dependencies. Account has been securely Deactivated instead.";

    await logActivity({
      orgId,
      userId: actorUserId,
      module: "ADMIN",
      action: "USER_DELETE_BLOCKED",
      entityType: "User",
      entityId: userId,
      summary: notice,
    });

    return { ok: true, deleted: false, deactivated: true, notice, user };
  }
}
