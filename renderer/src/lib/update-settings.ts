/**
 * User preferences for application updates (no auto-install).
 */

import { readStorage, subscribeStorage, writeStorage } from "./storage";

export type ReleaseChannel = "stable" | "beta" | "internal";

export type UpdateSettings = {
  checkEnabled: boolean;
  channel: ReleaseChannel;
  lastCheckAt: string | null;
  lastCheckResult: "update_available" | "up_to_date" | "error" | null;
  dismissedVersion: string | null;
};

const KEY = "benben.update.settings.v1";

const DEFAULTS: UpdateSettings = {
  checkEnabled: true,
  channel: "stable",
  lastCheckAt: null,
  lastCheckResult: null,
  dismissedVersion: null,
};

let cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };

export function getUpdateSettings(): UpdateSettings {
  return cache;
}

export function updateUpdateSettings(patch: Partial<UpdateSettings>): UpdateSettings {
  cache = { ...cache, ...patch };
  writeStorage(KEY, cache);
  return cache;
}

export function subscribeUpdateSettings(fn: () => void): () => void {
  return subscribeStorage(KEY, () => {
    cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };
    fn();
  });
}

/** Manifest endpoint — replace with production CDN when available. */
export function getUpdateManifestUrl(channel: ReleaseChannel): string {
  const base =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_UPDATE_MANIFEST_URL
      ? String(import.meta.env.VITE_UPDATE_MANIFEST_URL)
      : "https://releases.benben.app/manifest.json";
  return `${base}?channel=${channel}`;
}
