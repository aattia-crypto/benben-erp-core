import { ipcMain } from "electron";

import { IPC } from "../constants";
import { checkAndBootstrapDatabase } from "../services/database";
import {
  DEFAULT_LAN_UI_PORT,
  lanPortUnavailableMessage,
  verifyNetworkPortAvailability,
} from "../utils/network-port";

export function registerOnboardingIpc(): void {
  ipcMain.handle(IPC.onboarding.checkAndBootstrapDatabase, async () => {
    try {
      const data = await checkAndBootstrapDatabase();
      return { ok: true as const, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: message };
    }
  });

  ipcMain.handle(
    IPC.onboarding.verifyNetworkPort,
    async (_event, payload?: { port?: number }) => {
      const port = payload?.port ?? DEFAULT_LAN_UI_PORT;
      try {
        const available = await verifyNetworkPortAvailability(port);
        return {
          ok: true as const,
          data: {
            available,
            port,
            message: available
              ? `Port ${port} is available for LAN Mode.`
              : lanPortUnavailableMessage(port),
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, error: message };
      }
    },
  );
}
