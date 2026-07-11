/**
 * Secure local license vault — renderer bridge to encrypted AppData storage (main process).
 */
import type { ActivatedLicense } from "./licenseService";

export type LocalLicenseDetails = {
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
  licenseKeyFingerprint: string;
  lastVerifiedOnline?: string | null;
};

function isDesktopVaultAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.benben?.licensing?.saveLocalLicense &&
    !!window.benben?.licensing?.readLocalLicense
  );
}

/**
 * Encrypt and persist Polar activation data to the machine-bound vault.
 * Falls back to a dev warning when the desktop shell is unavailable.
 */
export function saveLocalLicense(licenseData: ActivatedLicense | Record<string, unknown>, key: string): void {
  if (isDesktopVaultAvailable()) {
    const result = window.benben!.licensing.saveLocalLicense(licenseData, key);
    if (!result.ok) {
      throw new Error(result.error ?? "Failed to save license vault.");
    }
    return;
  }

  if (import.meta.env?.DEV) {
    console.warn(
      "[licenseStorage] Desktop vault unavailable — license was not persisted to disk.",
    );
  }
}

/**
 * Decrypt and return stored license details on startup.
 * Returns null when the vault is missing, tampered, or expired (triggers onboarding).
 */
export function readLocalLicense(): LocalLicenseDetails | null {
  if (!isDesktopVaultAvailable()) return null;
  return window.benben!.licensing.readLocalLicense();
}
