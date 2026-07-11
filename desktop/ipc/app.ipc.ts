import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as appService from "../services/app.service";

export function registerAppIpc(): void {
  ipcMain.handle(IPC.app.getVersion, () => appService.getAppVersion());
  ipcMain.handle(IPC.app.getPaths, () => appService.getAppPaths());
  ipcMain.handle(IPC.app.ping, () => appService.ping());
  ipcMain.handle(IPC.app.getDiagnostics, () => appService.getAppDiagnostics());
}
