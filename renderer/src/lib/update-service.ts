/**
 * Update check — notification only; no forced or silent installs.
 */

import { isDesktopShell } from "./desktop-api";
import {
  getUpdateSettings,
  updateUpdateSettings,
  type ReleaseChannel,
} from "./update-settings";

export type UpdateManifestEntry = {
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string;
};

export type UpdateCheckResult = {
  ok: boolean;
  currentVersion: string;
  channel: ReleaseChannel;
  updateAvailable: boolean;
  latest: UpdateManifestEntry | null;
  error?: string;
  checkedAt: string;
};

/** Parse semver-ish strings for comparison (major.minor.patch). */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export async function getCurrentAppVersion(): Promise<string> {
  if (isDesktopShell()) {
    try {
      return await window.benben!.app.getVersion();
    } catch {
      return "0.0.0";
    }
  }
  return "0.0.0-web";
}

export async function checkForUpdates(
  channel?: ReleaseChannel,
): Promise<UpdateCheckResult> {
  const settings = getUpdateSettings();
  const ch = channel ?? settings.channel;
  const currentVersion = await getCurrentAppVersion();
  const checkedAt = new Date().toISOString();

  if (!isDesktopShell()) {
    return {
      ok: false,
      currentVersion,
      channel: ch,
      updateAvailable: false,
      latest: null,
      error: "Update checks require the Benben desktop app.",
      checkedAt,
    };
  }

  const res = (await window.benben!.update.check(ch)) as UpdateCheckResult & {
    data?: UpdateCheckResult;
    error?: string;
  };

  const result: UpdateCheckResult =
    res?.data ??
    (res?.currentVersion
      ? res
      : {
          ok: false,
          currentVersion,
          channel: ch,
          updateAvailable: false,
          latest: null,
          error: res?.error ?? "Update check failed",
          checkedAt,
        });

  updateUpdateSettings({
    lastCheckAt: checkedAt,
    lastCheckResult: result.updateAvailable
      ? "update_available"
      : result.ok
        ? "up_to_date"
        : "error",
  });

  return result;
}

export function shouldNotifyUpdate(result: UpdateCheckResult): boolean {
  if (!result.updateAvailable || !result.latest) return false;
  const settings = getUpdateSettings();
  if (settings.dismissedVersion === result.latest.version) return false;
  return compareVersions(result.currentVersion, result.latest.version) < 0;
}

export function dismissUpdateVersion(version: string): void {
  updateUpdateSettings({ dismissedVersion: version });
}
