import { ipcMain } from "electron";

import { IPC } from "../constants";
import { listSystemLogs } from "../services/audit.service";
import { getSystemStatus } from "../services/system-status.service";
import { assertTokenPermission } from "../services/permissions.service";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

export function registerSystemIpc(): void {
  ipcMain.handle(IPC.system.getStatus, () => getSystemStatus());

  ipcMain.handle(
    IPC.system.listActivityLogs,
    async (_event, payload: { token?: string; module?: string; action?: string; limit?: number }) => {
      try {
        await assertTokenPermission(payload?.token, "manage_users");
        const data = await listSystemLogs({
          module: payload.module,
          action: payload.action,
          limit: payload.limit ?? 200,
        });
        return { ok: true, data };
      } catch (err) {
        try {
          await assertTokenPermission(payload?.token, "view_finance");
          const data = await listSystemLogs({
            module: payload.module,
            action: payload.action,
            limit: payload.limit ?? 200,
          });
          return { ok: true, data };
        } catch (inner) {
          return ipcError(inner);
        }
      }
    },
  );
}
