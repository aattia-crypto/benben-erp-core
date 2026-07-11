import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as authService from "../services/auth.service";
import { logIpcActivity } from "./audit-context";

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.auth.login, async (_event, payload: { username: string; password: string }) => {
    try {
      return await authService.login(payload.username, payload.password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.auth.logout, async (_event, payload?: { token?: string | null }) => {
    try {
      return await authService.logout(payload?.token ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.auth.getSession, async (_event, payload?: { token?: string | null }) => {
    try {
      return await authService.getSession(payload?.token ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    IPC.auth.initializeAdmin,
    async (
      _event,
      payload: { username: string; password: string; companyName: string },
    ) => {
      try {
        return await authService.initializeAdmin(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    IPC.auth.changePassword,
    async (
      _event,
      payload: { token?: string; newPassword: string; currentPassword?: string },
    ) => {
      try {
        return await authService.changePassword(
          payload.token ?? null,
          payload.newPassword,
          payload.currentPassword,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    IPC.auth.provisionUser,
    async (
      event,
      payload: {
        token?: string;
        username: string;
        tempPassword: string;
        displayName: string;
        orgId: string;
        roleId: string;
        permissionsOverride?: Partial<import("../services/permissions.types").PermissionMap> | null;
        employeeId?: string | null;
      },
    ) => {
      try {
        const { assertTokenPermission } = await import("../services/permissions.service");
        await assertTokenPermission(payload.token, "manage_users");
        const { token: _t, ...input } = payload;
        const result = await authService.provisionSystemUser(input);
        if (result.ok) {
          await logIpcActivity(event, payload, {
            module: "ADMIN",
            action: "USER_PROVISIONED",
            entityType: "User",
            entityId: result.data.userId,
            summary: `Provisioned system account ${input.username} · role ${input.roleId}`,
          });
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );
}
