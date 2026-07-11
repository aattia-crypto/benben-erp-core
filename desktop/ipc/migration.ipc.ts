import { ipcMain } from "electron";

import { IPC } from "../constants";
import { logger } from "../utils/logger";
import {
  getLocalStorageMigrationStatus,
  importLocalStorageSnapshot,
} from "../services/localstorage-migration.service";
import type { LocalStorageMigrationSnapshot } from "../services/localstorage-migration.types";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

export function registerMigrationIpc(): void {
  ipcMain.handle(IPC.migration.getStatus, async () => {
    try {
      const data = await getLocalStorageMigrationStatus();
      return { ok: true, data };
    } catch (err) {
      logger.error("migration.getStatus failed", err);
      return ipcError(err);
    }
  });

  ipcMain.handle(IPC.migration.importSnapshot, async (_event, payload: LocalStorageMigrationSnapshot) => {
    try {
      if (!payload?.exportedAt || !payload.modules) {
        return { ok: false, error: "Invalid migration snapshot payload." };
      }
      const result = await importLocalStorageSnapshot(payload);
      if (!result.ok) {
        return { ok: false, error: result.error ?? "Migration import failed." };
      }
      return { ok: true, data: result };
    } catch (err) {
      logger.error("migration.importSnapshot failed", err);
      return ipcError(err);
    }
  });
}
