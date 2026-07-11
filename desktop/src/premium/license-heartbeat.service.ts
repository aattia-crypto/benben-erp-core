/**
 * Background Polar license heartbeat — commercial / premium module only.
 * Open-core launch does not import or invoke this module.
 */
import type { BrowserWindow } from "electron";

import { logger } from "../../utils/logger";
import { isDemoBuild } from "../../utils/build-flavor";
import {
  clearLocalLicenseVault,
  licenseVaultExists,
  readLocalLicenseVault,
  saveLocalLicense,
  updateLocalLicenseVault,
} from "../../services/license-storage.service";
import { verifyPolarLicenseOnline } from "./polar-license.service";

const ONLINE_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type LicenseLaunchGate = {
  allowed: boolean;
  initialRoute: string;
  notice?: string;
};

export type LicenseNavigationOptions = {
  initialRoute?: string;
  licenseNotice?: string;
};

let heartbeatInFlight = false;

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return (Date.now() - ts) / (24 * 60 * 60 * 1000);
}

function msSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

/** Fast synchronous vault check — must not perform network I/O. */
export function evaluatePolarVaultOnLaunch(): LicenseLaunchGate {
  if (isDemoBuild()) {
    return { allowed: true, initialRoute: "/" };
  }

  if (!licenseVaultExists()) {
    return {
      allowed: false,
      initialRoute: "/setup",
      notice: "License activation is required before using Benben ERP.",
    };
  }

  const vault = readLocalLicenseVault();
  if (!vault) {
    return {
      allowed: false,
      initialRoute: "/setup",
      notice: "Your license vault is missing or invalid. Please activate again.",
    };
  }

  if (msSince(vault.lastVerifiedOnline) > OFFLINE_GRACE_MS) {
    logger.warn("License offline grace period exceeded at launch", {
      lastVerifiedOnline: vault.lastVerifiedOnline,
    });
    return {
      allowed: false,
      initialRoute: "/setup",
      notice:
        "Benben could not verify your license within the offline grace window. Connect to the internet and activate again.",
    };
  }

  return { allowed: true, initialRoute: "/" };
}

function injectLicenseNotice(win: BrowserWindow, notice: string): void {
  void win.webContents
    .executeJavaScript(
      `window.__BENBEN_LICENSE_NOTICE__ = ${JSON.stringify(notice)};`,
    )
    .catch((err) => logger.warn("Failed to inject license notice", err));
}

export async function redirectToLicenseActivation(
  win: BrowserWindow,
  notice: string,
  loadRoute: (route: string, licenseNotice?: string) => Promise<void>,
): Promise<void> {
  await loadRoute("/setup", notice);
  if (!win.isDestroyed()) {
    injectLicenseNotice(win, notice);
  }
}

async function runBackgroundHeartbeat(
  win: BrowserWindow,
  loadRoute: (route: string, licenseNotice?: string) => Promise<void>,
): Promise<void> {
  if (heartbeatInFlight || win.isDestroyed()) return;
  heartbeatInFlight = true;

  try {
    const vault = readLocalLicenseVault();
    if (!vault) return;

    if (msSince(vault.lastVerifiedOnline) < ONLINE_RECHECK_MS) {
      logger.info("License heartbeat skipped — verified online within 7 days", {
        lastVerifiedOnline: vault.lastVerifiedOnline,
      });
      return;
    }

    logger.info("License heartbeat — background Polar verification started");
    const result = await verifyPolarLicenseOnline(vault.licenseKey);

    if (result.ok) {
      const now = new Date().toISOString();
      updateLocalLicenseVault({
        lastVerifiedOnline: now,
        lastOfflineGraceAt: null,
        license: {
          status: result.license.status,
          tier: result.license.tier,
          expiresAt: result.license.expiresAt,
          customer: result.license.customer,
          activationId: result.license.activationId,
          licenseKeyId: result.license.licenseKeyId,
        },
      });
      logger.info("License heartbeat succeeded", { verifiedAt: now });
      return;
    }

    if (result.reason === "network") {
      const offlineDays = daysSince(vault.lastVerifiedOnline);
      if (offlineDays <= 30) {
        updateLocalLicenseVault({
          lastOfflineGraceAt: new Date().toISOString(),
        });
        logger.warn("License heartbeat offline — within 30-day grace period", {
          offlineDays: Math.round(offlineDays),
        });
        return;
      }

      logger.error("License heartbeat offline grace exceeded");
      clearLocalLicenseVault();
      if (!win.isDestroyed()) {
        await redirectToLicenseActivation(
          win,
          "Benben could not verify your license while offline for more than 30 days. Please reconnect and activate again.",
          loadRoute,
        );
      }
      return;
    }

    if (result.reason === "revoked") {
      clearLocalLicenseVault();
      if (!win.isDestroyed()) {
        await redirectToLicenseActivation(win, result.message, loadRoute);
      }
      return;
    }

    logger.warn("License heartbeat invalid response", { message: result.message });
  } catch (err) {
    logger.error("License heartbeat unexpected failure", err);
  } finally {
    heartbeatInFlight = false;
  }
}

/**
 * Schedule heartbeat after the main window is visible — never blocks first paint.
 */
export function startBackgroundLicenseHeartbeat(
  win: BrowserWindow,
  loadRoute: (route: string, licenseNotice?: string) => Promise<void>,
): void {
  if (isDemoBuild()) return;
  setImmediate(() => {
    void runBackgroundHeartbeat(win, loadRoute);
  });
}

/** Refresh vault after onboarding activation from the renderer IPC path. */
export function recordLicenseActivation(licenseData: unknown, licenseKey: string): void {
  saveLocalLicense(licenseData, licenseKey);
}
