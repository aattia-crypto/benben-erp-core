/**
 * Encrypted Polar license vault — AppData license.vault.json (main process only).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";

import { getLicenseVaultPath } from "../utils/paths";
import { resolveAppDataRoot } from "../utils/platform";
import { logger } from "../utils/logger";
import { getMachineFingerprint } from "./licensing.service";

const ALGORITHM = "aes-256-gcm";
const VAULT_VERSION = 1;

const VAULT_SECRET =
  process.env.BENBEN_LICENSE_VAULT_SECRET?.trim() || "benben-license-vault-v1";

export type StoredLocalLicense = {
  status: string;
  tier: string | null;
  expiresAt: string | null;
  customer: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
  activationId: string | null;
  licenseKeyId: string | null;
  activatedAt: string;
};

export type LocalLicenseDetails = StoredLocalLicense & {
  licenseKeyFingerprint: string;
  lastVerifiedOnline: string | null;
};

export type LocalLicenseVaultRecord = LocalLicenseDetails & {
  licenseKey: string;
};

type VaultPlaintext = {
  license: StoredLocalLicense;
  licenseKey: string;
  keyFingerprint: string;
  lastVerifiedOnline: string | null;
  lastOfflineGraceAt: string | null;
};

type EncryptedVaultEnvelope = {
  version: typeof VAULT_VERSION;
  algorithm: typeof ALGORITHM;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  keyFingerprint: string;
};

function deriveVaultKey(salt: Buffer): Buffer {
  const material = `${VAULT_SECRET}|${getMachineFingerprint()}`;
  return scryptSync(material, salt, 32);
}

function fingerprintLicenseKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

function normalizeLicenseData(licenseData: unknown): StoredLocalLicense {
  const source =
    licenseData && typeof licenseData === "object"
      ? (licenseData as Record<string, unknown>)
      : {};

  const customerSource =
    source.customer && typeof source.customer === "object"
      ? (source.customer as Record<string, unknown>)
      : null;

  const status = typeof source.status === "string" ? source.status : "unknown";
  const tier =
    typeof source.tier === "string" && source.tier.trim() ? source.tier.trim() : null;
  const expiresAt =
    typeof source.expiresAt === "string" && source.expiresAt.trim()
      ? source.expiresAt.trim()
      : null;

  return {
    status,
    tier,
    expiresAt,
    customer: customerSource
      ? {
          id: typeof customerSource.id === "string" ? customerSource.id : null,
          name: typeof customerSource.name === "string" ? customerSource.name : null,
          email: typeof customerSource.email === "string" ? customerSource.email : null,
        }
      : null,
    activationId: typeof source.activationId === "string" ? source.activationId : null,
    licenseKeyId: typeof source.licenseKeyId === "string" ? source.licenseKeyId : null,
    activatedAt: new Date().toISOString(),
  };
}

/** True when the encrypted vault file exists on disk. */
export function licenseVaultExists(): boolean {
  return fs.existsSync(getLicenseVaultPath());
}

function normalizeVaultPlaintext(parsed: VaultPlaintext): VaultPlaintext {
  return {
    ...parsed,
    lastVerifiedOnline: parsed.lastVerifiedOnline ?? parsed.license.activatedAt ?? null,
    lastOfflineGraceAt: parsed.lastOfflineGraceAt ?? null,
  };
}

function readVaultPlaintext(): VaultPlaintext | null {
  const vaultPath = getLicenseVaultPath();
  if (!fs.existsSync(vaultPath)) return null;

  try {
    const envelope = JSON.parse(fs.readFileSync(vaultPath, "utf8")) as EncryptedVaultEnvelope;
    const plaintext = normalizeVaultPlaintext(decryptLicensePayload(envelope));
    if (plaintext.keyFingerprint !== fingerprintLicenseKey(plaintext.licenseKey)) {
      return null;
    }
    return plaintext;
  } catch {
    return null;
  }
}

function writeVaultPlaintext(plaintext: VaultPlaintext): void {
  const envelope = encryptLicensePayload(plaintext);
  const vaultPath = getLicenseVaultPath();
  fs.mkdirSync(resolveAppDataRoot(), { recursive: true });
  fs.writeFileSync(vaultPath, JSON.stringify(envelope, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** Encrypt a license payload for at-rest storage (AES-256-GCM). */
export function encryptLicensePayload(payload: VaultPlaintext): EncryptedVaultEnvelope {
  const salt = randomBytes(16);
  const key = deriveVaultKey(salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: VAULT_VERSION,
    algorithm: ALGORITHM,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    keyFingerprint: payload.keyFingerprint,
  };
}

function decryptLicensePayload(envelope: EncryptedVaultEnvelope): VaultPlaintext {
  if (envelope.version !== VAULT_VERSION || envelope.algorithm !== ALGORITHM) {
    throw new Error("Unsupported license vault format.");
  }

  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const authTag = Buffer.from(envelope.authTag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const key = deriveVaultKey(salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
  const parsed = JSON.parse(decrypted) as VaultPlaintext;

  if (parsed.keyFingerprint !== envelope.keyFingerprint) {
    throw new Error("License vault fingerprint mismatch.");
  }

  return parsed;
}

function isLicenseStillValid(license: StoredLocalLicense): boolean {
  const status = license.status.toLowerCase();
  if (["revoked", "disabled", "suspended", "expired", "inactive"].includes(status)) {
    return false;
  }
  if (license.expiresAt) {
    const expiry = Date.parse(license.expiresAt);
    if (!Number.isNaN(expiry) && expiry < Date.now()) return false;
  }
  return ["active", "granted", "valid"].includes(status);
}

function mapVaultRecord(plaintext: VaultPlaintext): LocalLicenseVaultRecord | null {
  if (!isLicenseStillValid(plaintext.license)) return null;
  return {
    ...plaintext.license,
    licenseKeyFingerprint: plaintext.keyFingerprint,
    lastVerifiedOnline: plaintext.lastVerifiedOnline,
    licenseKey: plaintext.licenseKey,
  };
}

/** Persist encrypted license activation data bound to this machine. */
export function saveLocalLicense(licenseData: unknown, key: string): void {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    logger.warn("saveLocalLicense skipped — empty license key.");
    return;
  }

  const now = new Date().toISOString();
  const keyFingerprint = fingerprintLicenseKey(trimmedKey);
  const plaintext: VaultPlaintext = {
    license: normalizeLicenseData(licenseData),
    licenseKey: trimmedKey,
    keyFingerprint,
    lastVerifiedOnline: now,
    lastOfflineGraceAt: null,
  };

  try {
    writeVaultPlaintext(plaintext);
    logger.info("Encrypted license vault saved", {
      path: getLicenseVaultPath(),
      keyFingerprint,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Failed to save encrypted license vault", { message });
    throw err;
  }
}

/** Read decrypted vault metadata for UI consumers (no license key returned). */
export function readLocalLicense(): LocalLicenseDetails | null {
  const record = readLocalLicenseVault();
  if (!record) return null;
  const { licenseKey: _key, ...details } = record;
  return details;
}

/** Read full decrypted vault including the stored license key (main process only). */
export function readLocalLicenseVault(): LocalLicenseVaultRecord | null {
  const plaintext = readVaultPlaintext();
  if (!plaintext) {
    logger.warn("Failed to read encrypted license vault");
    return null;
  }
  return mapVaultRecord(plaintext);
}

/** Update heartbeat timestamps and optional refreshed license fields. */
export function updateLocalLicenseVault(patch: {
  lastVerifiedOnline?: string;
  lastOfflineGraceAt?: string | null;
  license?: Partial<StoredLocalLicense>;
}): void {
  const plaintext = readVaultPlaintext();
  if (!plaintext) return;

  writeVaultPlaintext({
    ...plaintext,
    lastVerifiedOnline: patch.lastVerifiedOnline ?? plaintext.lastVerifiedOnline,
    lastOfflineGraceAt:
      patch.lastOfflineGraceAt === undefined
        ? plaintext.lastOfflineGraceAt
        : patch.lastOfflineGraceAt,
    license: patch.license ? { ...plaintext.license, ...patch.license } : plaintext.license,
  });
}

/** Remove the encrypted vault (revocation / forced re-activation). */
export function clearLocalLicenseVault(): void {
  const vaultPath = getLicenseVaultPath();
  if (!fs.existsSync(vaultPath)) return;
  fs.unlinkSync(vaultPath);
  logger.warn("Encrypted license vault cleared", { path: vaultPath });
}
