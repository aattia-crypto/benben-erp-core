import { ipcMain } from "electron";

import { IPC } from "../constants";
import { logger } from "../utils/logger";
import * as backupService from "../services/backup.service";
import * as backupScheduler from "../services/backup-scheduler.service";
import { startFinanceApiServer, stopFinanceApiServer } from "../server/finance-api-server";

export function registerBackupIpc(): void {
  ipcMain.handle(IPC.backup.create, () => {
    try {
      const entry = backupService.createBackup("manual");
      backupService.applyRetentionPolicy();
      return { ok: true, data: entry };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.backup.getHealth, () => {
    try {
      return { ok: true, data: backupScheduler.getBackupHealth() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC.backup.setPolicy, (_event, patch: Record<string, unknown>) => {
    try {
      return { ok: true, data: backupScheduler.updateBackupPolicy(patch) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC.backup.verify, (_event, id: string) => {
    try {
      return { ok: true, data: backupService.verifyBackup(id) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC.backup.runScheduled, () => {
    try {
      const entry = backupScheduler.runScheduledBackupIfDue();
      return { ok: true, data: { entry, health: backupScheduler.getBackupHealth() } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC.backup.list, () => {
    try {
      return { ok: true, data: backupService.listBackups() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.backup.restore, async (_event, id: string) => {
    let apiWasRunning = false;
    try {
      await stopFinanceApiServer();
      apiWasRunning = true;

      const result = await backupService.restoreBackup(id);
      return { ok: result.restored, data: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    } finally {
      if (apiWasRunning) {
        try {
          await startFinanceApiServer();
        } catch (restartErr) {
          logger.error("Failed to restart LAN API after restore", restartErr);
        }
      }
    }
  });
}
