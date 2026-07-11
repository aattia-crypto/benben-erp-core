import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as updateService from "../services/update.service";

export function registerUpdateIpc(): void {
  ipcMain.handle(IPC.update.getStatus, async () => {
    try {
      return { ok: true, data: updateService.getUpdateSchedulerStatus() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.update.check, async (_event, channel: updateService.ReleaseChannel) => {
    const ch = channel ?? "stable";
    try {
      return await updateService.runManualUpdateCheck(ch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        currentVersion: "0.0.0",
        channel: ch,
        updateAvailable: false,
        latest: null,
        error: message,
        checkedAt: new Date().toISOString(),
      };
    }
  });
}
