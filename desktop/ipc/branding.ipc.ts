import { ipcMain } from "electron";

import { IPC } from "../constants";
import {
  getAppBranding,
  updateAppBranding,
  type BrandingUpdateInput,
} from "../services/app-config.service";

export function registerBrandingIpc(): void {
  ipcMain.handle(IPC.branding.get, async () => {
    try {
      return { ok: true, data: getAppBranding() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.branding.update, async (_event, payload: BrandingUpdateInput) => {
    try {
      const data = updateAppBranding(payload ?? {});
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });
}
