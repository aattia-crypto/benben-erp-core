import { ipcMain } from "electron";

import { IPC } from "../constants";
import { printHtml } from "../services/print.service";

export function registerPrintIpc(): void {
  ipcMain.handle(IPC.print.printHtml, async (_event, payload: { html?: string }) => {
    const html = typeof payload?.html === "string" ? payload.html : "";
    return printHtml(html);
  });
}
