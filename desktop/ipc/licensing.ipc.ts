import { app, ipcMain } from "electron";

import { IPC } from "../constants";
import {
  activateLicenseKey,
  getLicenseStatus,
  getMachineFingerprint,
} from "../services/licensing.service";
import {
  readLocalLicense,
  saveLocalLicense,
} from "../services/license-storage.service";
import { logger } from "../utils/logger";

export function registerLicensingIpc(): void {
  ipcMain.handle(IPC.licensing.getStatus, async () => {
    try {
      return { ok: true, data: getLicenseStatus() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.licensing.getMachineFingerprint, async () => {
    try {
      return { ok: true, data: { fingerprint: getMachineFingerprint() } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    IPC.licensing.activate,
    async (_event, payload: { activationKey: string; seatCount?: number }) => {
      try {
        const data = await activateLicenseKey(payload.activationKey, payload.seatCount ?? 5);
        logger.info("Activation IPC succeeded — relaunching application");
        setImmediate(() => {
          app.relaunch();
          app.exit(0);
        });
        return { ok: true, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.on(
    IPC.licensing.saveLocal,
    (event, payload: { licenseData: unknown; key: string }) => {
      try {
        saveLocalLicense(payload.licenseData, payload.key);
        event.returnValue = { ok: true as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        event.returnValue = { ok: false as const, error: message };
      }
    },
  );

  ipcMain.on(IPC.licensing.readLocal, (event) => {
    event.returnValue = { ok: true as const, data: readLocalLicense() };
  });
}
