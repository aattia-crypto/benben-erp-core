/**
 * Optional soft-loader for the commercial Polar licensing module.
 * Returns null when the premium package is omitted from the runtime tree.
 * Open-core must never throw on missing Polar modules.
 */
import type { BrowserWindow } from "electron";

import { logger } from "../utils/logger";

export type LicenseLaunchGate = {
  allowed: boolean;
  initialRoute: string;
  notice?: string;
};

export type MainWindowNavigationOptions = {
  initialRoute?: string;
  licenseNotice?: string;
};

export type PremiumLicenseModule = {
  evaluatePolarVaultOnLaunch: () => LicenseLaunchGate;
  startBackgroundLicenseHeartbeat: (
    win: BrowserWindow,
    loadRoute: (route: string, licenseNotice?: string) => Promise<void>,
  ) => void;
};

export function tryLoadPremiumLicenseModule(): PremiumLicenseModule | null {
  const enabled =
    process.env.BENBEN_PREMIUM_LICENSING === "1" ||
    process.env.BENBEN_PREMIUM_LICENSING === "true";
  if (!enabled) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../src/premium") as PremiumLicenseModule;
   if (
      typeof mod?.evaluatePolarVaultOnLaunch !== "function" ||
      typeof mod?.startBackgroundLicenseHeartbeat !== "function"
    ) {
      return null;
    }
    return mod;
  } catch (err) {
    logger.info("Premium Polar licensing module not loaded (open-core local-first)", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
