import { readStorage, subscribeStorage, writeStorage } from "./storage";
import type { ReleaseChannel } from "./update-settings";

export type ReleaseSettings = {
  channel: ReleaseChannel;
  showBuildDetails: boolean;
};

const KEY = "benben.release.settings.v1";

const DEFAULTS: ReleaseSettings = {
  channel: "stable",
  showBuildDetails: true,
};

let cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };

export function getReleaseSettings(): ReleaseSettings {
  return cache;
}

export function updateReleaseSettings(patch: Partial<ReleaseSettings>): ReleaseSettings {
  cache = { ...cache, ...patch };
  writeStorage(KEY, cache);
  return cache;
}

export function subscribeReleaseSettings(fn: () => void): () => void {
  return subscribeStorage(KEY, () => {
    cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };
    fn();
  });
}
