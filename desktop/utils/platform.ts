import fs from "node:fs";
import path from "node:path";

import { LEGACY_APP_NAME } from "../constants";
import { getAppNameForBuild, isDemoBuild } from "./build-flavor";

export type OsPlatform = "win32" | "darwin" | "linux" | "other";

export function getOsPlatform(): OsPlatform {
  const p = process.platform;
  if (p === "win32" || p === "darwin" || p === "linux") return p;
  return "other";
}

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function isLinux(): boolean {
  return process.platform === "linux";
}

/** Normalize user-provided paths for the current OS. */
export function normalizeUserPath(input: string): string {
  return path.normalize(input.trim());
}

function resolveAppDataRootForFolder(folderName: string): string {
  switch (process.platform) {
    case "win32": {
      const appData = process.env.APPDATA;
      if (appData) return path.join(appData, folderName);
      const profile = process.env.USERPROFILE ?? process.env.HOME;
      if (!profile) {
        throw new Error("Cannot resolve Windows app data: APPDATA and USERPROFILE are unset.");
      }
      return path.join(profile, "AppData", "Roaming", folderName);
    }
    case "darwin": {
      const home = process.env.HOME;
      if (!home) throw new Error("Cannot resolve macOS app data: HOME is unset.");
      return path.join(home, "Library", "Application Support", folderName);
    }
    case "linux": {
      const home = process.env.HOME;
      if (!home) throw new Error("Cannot resolve Linux app data: HOME is unset.");
      const xdgData = process.env.XDG_DATA_HOME;
      if (xdgData) return path.join(xdgData, folderName);
      return path.join(home, ".local", "share", folderName);
    }
    default:
      throw new Error(`Unsupported platform for app data: ${process.platform}`);
  }
}

/**
 * Cross-platform Benben app data root (database, backups, attachments, logs).
 * Windows: %APPDATA%/Benben ERP
 *
 * Falls back to the legacy NexusCore folder when present so existing installs keep
 * PostgreSQL clusters, license.json, and config.json without migration.
 */
export function resolveAppDataRoot(): string {
  const primary = resolveAppDataRootForFolder(getAppNameForBuild());
  if (isDemoBuild()) return primary;

  if (fs.existsSync(primary)) return primary;

  const legacy = resolveAppDataRootForFolder(LEGACY_APP_NAME);
  if (fs.existsSync(legacy)) return legacy;

  return primary;
}

/** Parent directory of {@link resolveAppDataRoot} (legacy helper). */
export function resolveUserDataParent(): string {
  return path.dirname(resolveAppDataRoot());
}
