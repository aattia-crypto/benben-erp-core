import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as supportBundle from "../services/support-bundle.service";

export function registerSupportIpc(): void {
  ipcMain.handle(IPC.support.exportBundle, (_event, extra?: supportBundle.SupportBundleInput) => {
    return supportBundle.createSupportBundle(extra);
  });
}
