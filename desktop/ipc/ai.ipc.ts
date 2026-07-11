import { createHash } from "node:crypto";
import { ipcMain } from "electron";

import { IPC } from "../constants";
import { aiService } from "../services/ai.service";
import { isAiApiKeyConfigured, saveAiApiKeyToConfig } from "../services/app-config.service";
import { getPrisma } from "../services/database";
import { extractToken } from "./permission-guard";
import { isPresenterBypassToken } from "../utils/presenter-auth-bypass";

function ipcError(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
}

async function assertAuthenticatedSession(payload: unknown): Promise<void> {
  const token = extractToken(payload);
  if (!token) throw new Error("Authentication required.");
  if (isPresenterBypassToken(token)) return;
  const db = getPrisma();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date() || !row.user.isActive) {
    throw new Error("Session expired or invalid.");
  }
}

export function registerAiIpc(): void {
  ipcMain.handle(IPC.ai.sendQuery, async (_event, payload: { token?: string; prompt?: string }) => {
    try {
      await assertAuthenticatedSession(payload);
      const prompt = typeof payload?.prompt === "string" ? payload.prompt : "";
      const answer = await aiService.processUserQuery(prompt);
      return { ok: true as const, data: answer };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(IPC.ai.getStatus, async (_event, payload: { token?: string }) => {
    try {
      await assertAuthenticatedSession(payload);
      return { ok: true as const, data: { configured: isAiApiKeyConfigured() } };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(IPC.ai.saveApiKey, async (_event, payload: { token?: string; apiKey?: string }) => {
    try {
      await assertAuthenticatedSession(payload);
      const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
      if (!apiKey) {
        return { ok: false as const, error: "API key cannot be empty." };
      }
      saveAiApiKeyToConfig(apiKey);
      return { ok: true as const, data: { configured: true } };
    } catch (err) {
      return ipcError(err);
    }
  });
}
