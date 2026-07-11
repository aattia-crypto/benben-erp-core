/**
 * Desktop licensing — 30-day local trial + Lemon Squeezy license activation (AppData license.json).
 */
import { createHmac, createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";

import { getLicensePath } from "../utils/paths";
import { resolveAppDataRoot } from "../utils/platform";
import { logger } from "../utils/logger";

const TRIAL_DAYS = 30;
const LEMON_SQUEEZY_ACTIVATE_URL = "https://api.lemonsqueezy.com/v1/licenses/activate";

/** Local HMAC secret for tamper detection on cached validation payloads. */
const LICENSE_HMAC_SECRET =
  process.env.BENBEN_LICENSE_HMAC_SECRET?.trim() || "benben-offline-license-v1";

export type LicenseMode = "trial" | "activated" | "expired";

export type LemonSqueezyLicenseKey = {
  id?: number;
  status?: string;
  key?: string;
  activation_limit?: number;
  activation_usage?: number;
  expires_at?: string | null;
};

export type LemonSqueezyActivationPayload = {
  activated?: boolean;
  valid?: boolean;
  error?: string | null;
  license_key?: LemonSqueezyLicenseKey;
  instance?: {
    id?: string;
    name?: string;
    created_at?: string;
  };
  meta?: Record<string, unknown>;
};

export type StoredLicense = {
  mode: LicenseMode;
  trialStartedAt: string | null;
  activationKey: string | null;
  activatedAt: string | null;
  organizationId: string;
  seatCount: number;
  machineFingerprint: string | null;
  /** Lemon Squeezy license instance UUID returned from /licenses/activate. */
  lemonSqueezyInstanceId: string | null;
  /** Full Lemon Squeezy activation response cached for offline gate checks. */
  validationPayload: LemonSqueezyActivationPayload | null;
  /** HMAC signature over instance id + license key + subscription status. */
  validationSignature: string | null;
};

export type LicenseAccessResult = {
  allowed: boolean;
  mode: LicenseMode;
  daysRemaining: number;
  message: string;
  trialStartedAt: string | null;
  activatedAt: string | null;
  seatCount: number;
};

export type LicenseStatusDto = LicenseAccessResult & {
  machineFingerprint: string;
  activationKeyMasked: string | null;
};

export type LicensePayload = {
  organizationId: string;
  seatCount: number;
  edition: "trial" | "standard" | "enterprise";
  expiresAt: string | null;
  signature: string | null;
};

export type LicenseValidation = {
  valid: boolean;
  message: string;
  payload: LicensePayload | null;
};

const DEFAULT_STORED: StoredLicense = {
  mode: "trial",
  trialStartedAt: null,
  activationKey: null,
  activatedAt: null,
  organizationId: "",
  seatCount: 5,
  machineFingerprint: null,
  lemonSqueezyInstanceId: null,
  validationPayload: null,
  validationSignature: null,
};

function normalizeKey(key: string): string {
  return key.trim();
}

function computeValidationSignature(
  instanceId: string,
  licenseKey: string,
  status: string,
): string {
  return createHmac("sha256", LICENSE_HMAC_SECRET)
    .update(`${instanceId}|${licenseKey.trim()}|${status}`)
    .digest("hex");
}

function maskActivationKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) return "****";
  return `${trimmed.slice(0, 8)}****${trimmed.slice(-4)}`;
}

export function getMachineFingerprint(): string {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16).toUpperCase();
}

function readStoredLicense(): StoredLicense {
  const licensePath = getLicensePath();
  if (!fs.existsSync(licensePath)) {
    return { ...DEFAULT_STORED };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(licensePath, "utf8")) as Partial<StoredLicense>;
    return { ...DEFAULT_STORED, ...parsed };
  } catch {
    return { ...DEFAULT_STORED };
  }
}

function writeStoredLicense(license: StoredLicense): void {
  fs.mkdirSync(resolveAppDataRoot(), { recursive: true });
  fs.writeFileSync(getLicensePath(), JSON.stringify(license, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function ensureTrialStarted(license: StoredLicense): StoredLicense {
  if (license.mode === "activated") return license;
  if (license.trialStartedAt) return license;
  const next: StoredLicense = {
    ...license,
    mode: "trial",
    trialStartedAt: new Date().toISOString(),
    machineFingerprint: license.machineFingerprint ?? getMachineFingerprint(),
  };
  writeStoredLicense(next);
  return next;
}

export function trialDaysRemaining(trialStartedAt: string | null): number {
  if (!trialStartedAt) return TRIAL_DAYS;
  const elapsed = (Date.now() - new Date(trialStartedAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
}

function subscriptionIsActive(payload: LemonSqueezyActivationPayload | null): boolean {
  if (!payload) return false;
  const status = payload.license_key?.status?.toLowerCase();
  if (status === "active") return true;
  if (payload.activated === true && status !== "expired" && status !== "disabled") return true;
  if (payload.valid === true && status !== "expired" && status !== "disabled") return true;
  return false;
}

function verifyStoredValidationSignature(license: StoredLicense): boolean {
  if (
    !license.lemonSqueezyInstanceId ||
    !license.activationKey ||
    !license.validationSignature ||
    !license.validationPayload
  ) {
    return false;
  }
  const status = license.validationPayload.license_key?.status ?? "active";
  const expected = computeValidationSignature(
    license.lemonSqueezyInstanceId,
    license.activationKey,
    status,
  );
  return expected === license.validationSignature;
}

function storedLicenseIsActivated(license: StoredLicense): boolean {
  if (license.mode !== "activated") return false;
  if (!verifyStoredValidationSignature(license)) return false;
  return subscriptionIsActive(license.validationPayload);
}

async function activateWithLemonSqueezy(licenseKey: string): Promise<{
  payload: LemonSqueezyActivationPayload;
  instanceId: string;
  signature: string;
}> {
  const instanceName = getMachineFingerprint();
  const res = await fetch(LEMON_SQUEEZY_ACTIVATE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      license_key: licenseKey.trim(),
      instance_name: instanceName,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  let payload: LemonSqueezyActivationPayload;
  try {
    payload = (await res.json()) as LemonSqueezyActivationPayload;
  } catch {
    throw new Error(`License server returned an invalid response (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(payload.error?.trim() || `License activation failed (${res.status}).`);
  }

  if (payload.error) {
    throw new Error(payload.error);
  }

  const activated = payload.activated === true || payload.valid === true;
  if (!activated || !subscriptionIsActive(payload)) {
    const status = payload.license_key?.status ?? "unknown";
    throw new Error(`License not active (status: ${status}).`);
  }

  const instanceId = payload.instance?.id?.trim();
  if (!instanceId) {
    throw new Error("Activation succeeded but no instance ID was returned.");
  }

  const status = payload.license_key?.status ?? "active";
  const signature = computeValidationSignature(instanceId, licenseKey, status);

  return { payload, instanceId, signature };
}

/** Main-process gate — trial active or valid Lemon Squeezy activation on disk. */
export function evaluateLicenseAccess(): LicenseAccessResult {
  let license = readStoredLicense();

  if (license.mode !== "activated") {
    license = ensureTrialStarted(license);
  }

  if (storedLicenseIsActivated(license)) {
    return {
      allowed: true,
      mode: "activated",
      daysRemaining: TRIAL_DAYS,
      message: "Subscription active.",
      trialStartedAt: license.trialStartedAt,
      activatedAt: license.activatedAt,
      seatCount: license.seatCount,
    };
  }

  const daysRemaining = trialDaysRemaining(license.trialStartedAt);
  if (daysRemaining > 0) {
    return {
      allowed: true,
      mode: "trial",
      daysRemaining,
      message: `Trial active (${daysRemaining} day(s) remaining).`,
      trialStartedAt: license.trialStartedAt,
      activatedAt: null,
      seatCount: license.seatCount,
    };
  }

  if (license.mode !== "expired") {
    writeStoredLicense({ ...license, mode: "expired" });
  }

  return {
    allowed: false,
    mode: "expired",
    daysRemaining: 0,
    message: "Trial expired. Enter a valid license key to continue.",
    trialStartedAt: license.trialStartedAt,
    activatedAt: null,
    seatCount: license.seatCount,
  };
}

export function getLicenseStatus(): LicenseStatusDto {
  const access = evaluateLicenseAccess();
  const stored = readStoredLicense();
  const key = stored.activationKey;
  return {
    ...access,
    machineFingerprint: getMachineFingerprint(),
    activationKeyMasked: key ? maskActivationKey(key) : null,
  };
}

export async function activateLicenseKey(key: string, seatCount = 5): Promise<LicenseStatusDto> {
  const normalized = normalizeKey(key);
  if (!normalized) {
    throw new Error("License key is required.");
  }

  const { payload, instanceId, signature } = await activateWithLemonSqueezy(normalized);
  const now = new Date().toISOString();
  const productName =
    typeof payload.meta?.product_name === "string" ? payload.meta.product_name : "Benben";

  const stored: StoredLicense = {
    mode: "activated",
    trialStartedAt: readStoredLicense().trialStartedAt,
    activationKey: normalized,
    activatedAt: now,
    organizationId: productName,
    seatCount,
    machineFingerprint: getMachineFingerprint(),
    lemonSqueezyInstanceId: instanceId,
    validationPayload: payload,
    validationSignature: signature,
  };
  writeStoredLicense(stored);
  logger.info("Lemon Squeezy license activated", {
    instanceId,
    productName,
    status: payload.license_key?.status,
  });
  return getLicenseStatus();
}

export function describeTrialState(trialStartedAt: string | null, trialDays: number): {
  mode: "trial";
  daysRemaining: number;
} {
  return { mode: "trial", daysRemaining: trialDaysRemaining(trialStartedAt) || trialDays };
}
