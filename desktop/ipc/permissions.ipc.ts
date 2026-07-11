import { ipcMain } from "electron";

import { IPC } from "../constants";
import {
  assignUserRole,
  ensureOrgRoles,
  listOrgRoles,
  resolveUserPermissions,
  updateOrgRolePermissions,
} from "../services/permissions.service";
import type { PermissionMap } from "../services/permissions.types";
import { assertTokenPermission } from "../services/permissions.service";
import { getPrisma } from "../services/database";
import {
  deactivateUserAccount,
  deleteUserAccount,
  listOrgUsers,
  reactivateUserAccount,
} from "../services/user-lifecycle.service";
import { logIpcActivity } from "./audit-context";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

export function registerPermissionsIpc(): void {
  ipcMain.handle(IPC.permissions.listUsers, async (_event, payload: { token?: string }) => {
    try {
      await assertTokenPermission(payload?.token, "manage_users");
      const data = await listOrgUsers();
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    IPC.permissions.deactivateUser,
    async (_event, payload: { token?: string; userId: string }) => {
      try {
        const auth = await assertTokenPermission(payload?.token, "manage_users");
        const data = await deactivateUserAccount(payload.userId, auth.userId);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.permissions.reactivateUser,
    async (_event, payload: { token?: string; userId: string }) => {
      try {
        const auth = await assertTokenPermission(payload?.token, "manage_users");
        const data = await reactivateUserAccount(payload.userId, auth.userId);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.permissions.deleteUser,
    async (_event, payload: { token?: string; userId: string }) => {
      try {
        const auth = await assertTokenPermission(payload?.token, "manage_users");
        const data = await deleteUserAccount(payload.userId, auth.userId);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.permissions.resetUserPassword,
    async (
      event,
      payload: { token?: string; userId: string; newPassword: string },
    ) => {
      try {
        const auth = await assertTokenPermission(payload?.token, "manage_users");
        const { resetUserAccountPassword } = await import("../services/user-lifecycle.service");
        const data = await resetUserAccountPassword(
          payload.userId,
          auth.userId,
          payload.newPassword,
        );
        await logIpcActivity(event, payload, {
          module: "ADMIN",
          action: "USER_PASSWORD_RESET",
          entityType: "User",
          entityId: payload.userId,
          summary: `Admin reset password for ${data.user.username}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(IPC.permissions.listRoles, async (_event, payload: { token?: string }) => {
    try {
      await assertTokenPermission(payload?.token, "manage_users");
      await ensureOrgRoles();
      const data = await listOrgRoles();
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    IPC.permissions.updateRole,
    async (
      event,
      payload: { token?: string; roleId: string; permissions: Partial<PermissionMap> },
    ) => {
      try {
        const auth = await assertTokenPermission(payload?.token, "manage_users");
        await updateOrgRolePermissions(payload.roleId, payload.permissions);
        await logIpcActivity(event, payload, {
          module: "ADMIN",
          action: "ROLE_TEMPLATE_UPDATED",
          entityType: "OrgRole",
          entityId: payload.roleId,
          summary: `Updated permission template for ${payload.roleId}`,
        });
        return { ok: true };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    IPC.permissions.assignUserRole,
    async (
      event,
      payload: {
        token?: string;
        userId: string;
        roleId: string;
        permissionsOverride?: Partial<PermissionMap> | null;
      },
    ) => {
      try {
        const auth = await assertTokenPermission(payload?.token, "manage_users");
        await assignUserRole(payload.userId, payload.roleId, payload.permissionsOverride);
        await logIpcActivity(event, payload, {
          module: "ADMIN",
          action: "USER_ROLE_ASSIGNED",
          entityType: "User",
          entityId: payload.userId,
          summary: `Assigned enterprise role ${payload.roleId}`,
        });
        return { ok: true };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(IPC.permissions.getForUser, async (_event, payload: { token?: string; userId?: string }) => {
    try {
      const auth = await assertTokenPermission(payload?.token, "manage_users");
      const userId = payload.userId ?? auth.userId;
      const db = getPrisma();
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("User not found.");
      const permissions = await resolveUserPermissions(user);
      return {
        ok: true,
        data: { userId: user.id, roleId: user.role, permissions },
      };
    } catch (err) {
      return ipcError(err);
    }
  });
}
