import { ipcMain, dialog } from "electron";
import fs from "node:fs";
import path from "node:path";

import { IPC } from "../constants";

export function registerDialogIpc(): void {
  ipcMain.handle(IPC.dialog.pickFolder, async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Select backup folder",
    });
    if (res.canceled || !res.filePaths[0]) return { ok: true, data: null };
    return { ok: true, data: res.filePaths[0] };
  });

  ipcMain.handle(IPC.dialog.pickFile, async (_event, filters?: { name: string; extensions: string[] }[]) => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: filters ?? [
        { name: "Spreadsheets", extensions: ["csv", "xlsx", "xls"] },
        { name: "Documents", extensions: ["pdf", "txt"] },
        { name: "All", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: true, data: null };
    return { ok: true, data: res.filePaths[0] };
  });

  ipcMain.handle(IPC.dialog.validatePath, async (_event, targetPath: string) => {
    if (!targetPath?.trim()) return { ok: false, error: "Path is required." };
    const p = path.resolve(targetPath.trim());
    try {
      const stat = fs.statSync(p);
      if (!stat.isDirectory()) return { ok: false, error: "Path exists but is not a directory." };
      fs.accessSync(p, fs.constants.W_OK);
      return { ok: true, data: { path: p, writable: true } };
    } catch {
      try {
        fs.mkdirSync(p, { recursive: true });
        fs.accessSync(p, fs.constants.W_OK);
        return { ok: true, data: { path: p, writable: true, created: true } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Cannot access path.";
        return { ok: false, error: msg };
      }
    }
  });
}
