import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

import { logger } from "../utils/logger";

/** Opens the OS print dialog for a fully-formed HTML document via a hidden window. */
export async function printHtml(html: string): Promise<{ ok: boolean; error?: string }> {
  const payload = html?.trim();
  if (!payload) {
    return { ok: false, error: "Print document is empty." };
  }

  const tmpFile = path.join(
    app.getPath("temp"),
    `benben-print-${process.pid}-${Date.now()}.html`,
  );

  let printWindow: BrowserWindow | null = null;

  try {
    fs.writeFileSync(tmpFile, payload, "utf8");

    printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    await printWindow.loadFile(tmpFile);

    return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      printWindow!.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        if (success) resolve({ ok: true });
        else resolve({ ok: false, error: failureReason || "Print cancelled or failed" });
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("printHtml failed", err);
    return { ok: false, error: message };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy();
    }
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // temp file may already be removed
    }
  }
}
