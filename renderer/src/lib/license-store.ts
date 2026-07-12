/**
 * Licensing foundation — offline-first; no online validation yet.
 */

import { readLocalLicense } from "./licenseStorage";
import { readStorage, subscribeStorage, writeStorage } from "./storage";
import { randomUUID } from "./uuid";

export type LicenseMode = "trial" | "activated" | "expired" | "unlicensed";

export type LicenseRecord = {
  mode: LicenseMode;
  organizationId: string;
  seatCount: number;
  seatsUsed: number;
  activationKey: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  trialStartedAt: string | null;
  offlineToken: string | null;
};

const KEY = "benben.license.v1";
const TRIAL_DAYS = 30;

const DEFAULTS: LicenseRecord = {
  mode: "trial",
  organizationId: "",
  seatCount: 5,
  seatsUsed: 1,
  activationKey: null,
  activatedAt: null,
  expiresAt: null,
  trialStartedAt: null,
  offlineToken: null,
};

let cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };

function ensureTrialStart(): LicenseRecord {
  if (!cache.trialStartedAt) {
    cache.trialStartedAt = new Date().toISOString();
    writeStorage(KEY, cache);
  }
  return cache;
}

export function getLicense(): LicenseRecord {
  return ensureTrialStart();
}

export function updateLicense(patch: Partial<LicenseRecord>): LicenseRecord {
  cache = { ...cache, ...patch };
  writeStorage(KEY, cache);
  return cache;
}

export function subscribeLicense(fn: () => void): () => void {
  return subscribeStorage(KEY, () => {
    cache = { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };
    fn();
  });
}

/** Placeholder validation — production will verify signed keys server-side or offline bundle. */
export function validateActivationKey(key: string): { ok: boolean; message: string } {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, message: "Enter an activation key." };
  if (!/^NXC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(trimmed)) {
    return { ok: false, message: "Key format: NXC-XXXX-XXXX-XXXX (placeholder validator)." };
  }
  return { ok: true, message: "Key format accepted (offline activation not enforced yet)." };
}

export function activateLicense(key: string, seats = 5): LicenseRecord {
  const v = validateActivationKey(key);
  if (!v.ok) throw new Error(v.message);
  return updateLicense({
    mode: "activated",
    activationKey: key.trim().toUpperCase(),
    activatedAt: new Date().toISOString(),
    seatCount: seats,
    expiresAt: null,
    offlineToken: `offline-${randomUUID().slice(0, 8)}`,
  });
}

export function trialDaysRemaining(): number {
  const lic = ensureTrialStart();
  if (lic.mode !== "trial" || !lic.trialStartedAt) return TRIAL_DAYS;
  const start = new Date(lic.trialStartedAt).getTime();
  const elapsed = (Date.now() - start) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
}

const INACTIVE_VAULT_STATUSES = new Set([
  "revoked",
  "disabled",
  "suspended",
  "expired",
  "inactive",
]);

function isExpiryPast(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return !Number.isNaN(expiry) && expiry < Date.now();
}

/**
 * Enterprise modules (Manufacturing, Imports, Finance, HR) unlock when the
 * encrypted vault holds a valid license, or when local mode is activated/trial.
 */
export function isEnterpriseLicenseActive(): boolean {
  const vault = readLocalLicense();
  if (vault) {
    const status = (vault.status ?? "").toLowerCase();
    if (INACTIVE_VAULT_STATUSES.has(status)) return false;
    if (isExpiryPast(vault.expiresAt)) return false;
    return true;
  }

  const lic = getLicense();
  if (lic.mode === "activated") {
    return !isExpiryPast(lic.expiresAt);
  }
  if (lic.mode === "trial") {
    if (isExpiryPast(lic.expiresAt)) return false;
    return trialDaysRemaining() > 0;
  }
  return false;
}
