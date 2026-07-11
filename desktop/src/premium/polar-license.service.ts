/**
 * Polar license API — commercial / premium module only.
 * Optional online activation / heartbeat verification (not required by open-core).
 */
import { logger } from "../../utils/logger";

const POLAR_ACTIVATE_URL =
  process.env.VITE_POLAR_LICENSE_ACTIVATE_URL?.trim() ||
  process.env.POLAR_LICENSE_ACTIVATE_URL?.trim() ||
  "https://api.polar.sh/v1/licenses/activate";

const MOCK_ORG_ID = "MOCK_ORG_ID";

const REVOKED_STATUSES = new Set(["revoked", "disabled", "suspended", "expired", "inactive"]);

export type PolarActivatedLicense = {
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
  raw: unknown;
};

export type PolarVerifyResult =
  | { ok: true; license: PolarActivatedLicense }
  | { ok: false; reason: "network" | "revoked" | "invalid"; message: string };

type PolarLicenseKeyPayload = {
  id?: string;
  status?: string;
  benefit_id?: string;
  expires_at?: string | null;
  customer?: { id?: string; name?: string | null; email?: string | null } | null;
  metadata?: Record<string, unknown>;
};

type PolarActivationPayload = {
  id?: string;
  license_key_id?: string;
  meta?: Record<string, unknown>;
  license_key?: PolarLicenseKeyPayload;
  status?: string;
  tier?: string;
  benefit?: { name?: string; description?: string };
  customer?: PolarLicenseKeyPayload["customer"];
};

function resolvePolarOrganizationId(): string {
  return (
    process.env.NEXT_PUBLIC_POLAR_ORGANIZATION_ID?.trim() ||
    process.env.VITE_POLAR_ORGANIZATION_ID?.trim() ||
    MOCK_ORG_ID
  );
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  return err.name === "AbortError" || /fetch failed|network|timeout/i.test(err.message);
}

function isLicenseActive(status: string | undefined, expiresAt: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  if (!normalized || REVOKED_STATUSES.has(normalized)) return false;
  if (expiresAt) {
    const expiry = Date.parse(expiresAt);
    if (!Number.isNaN(expiry) && expiry < Date.now()) return false;
  }
  return ["active", "granted", "valid"].includes(normalized);
}

function extractTier(payload: PolarActivationPayload, licenseKey: PolarLicenseKeyPayload | undefined): string | null {
  const metaTier = payload.meta?.tier ?? payload.meta?.benefit_name ?? licenseKey?.metadata?.tier;
  if (typeof metaTier === "string" && metaTier.trim()) return metaTier.trim();
  if (typeof payload.tier === "string" && payload.tier.trim()) return payload.tier.trim();
  if (payload.benefit?.name?.trim()) return payload.benefit.name.trim();
  if (licenseKey?.benefit_id) return licenseKey.benefit_id;
  return null;
}

function mapActivationPayload(payload: PolarActivationPayload): PolarActivatedLicense {
  const licenseKey = payload.license_key;
  const status =
    licenseKey?.status ??
    payload.status ??
    (typeof payload.meta?.status === "string" ? payload.meta.status : "unknown");

  const customerSource = licenseKey?.customer ?? payload.customer;

  return {
    status,
    tier: extractTier(payload, licenseKey),
    customer: customerSource
      ? {
          id: customerSource.id ?? null,
          name: customerSource.name ?? null,
          email: customerSource.email ?? null,
        }
      : null,
    expiresAt: licenseKey?.expires_at ?? null,
    activationId: payload.id ?? null,
    licenseKeyId: payload.license_key_id ?? licenseKey?.id ?? null,
    raw: payload,
  };
}

function payloadIndicatesRevocation(payload: unknown, httpStatus: number): boolean {
  if (httpStatus === 403 || httpStatus === 410) return true;
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const detail = typeof record.detail === "string" ? record.detail.toLowerCase() : "";
  if (/revok|suspend|expir|disabled|inactive/.test(detail)) return true;
  const licenseKey = record.license_key as PolarLicenseKeyPayload | undefined;
  const status = (licenseKey?.status ?? record.status ?? "").toString().toLowerCase();
  return REVOKED_STATUSES.has(status);
}

/** Re-validate a stored Polar license key (used by the background heartbeat). */
export async function verifyPolarLicenseOnline(licenseKey: string): Promise<PolarVerifyResult> {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    return { ok: false, reason: "invalid", message: "License key missing from vault." };
  }

  try {
    const response = await fetch(POLAR_ACTIVATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: trimmedKey,
        organization_id: resolvePolarOrganizationId(),
      }),
      signal: AbortSignal.timeout(25_000),
    });

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { detail: text };
      }
    }

    if (!response.ok) {
      if (payloadIndicatesRevocation(payload, response.status)) {
        return {
          ok: false,
          reason: "revoked",
          message: "Your license is no longer active. Please activate a valid key to continue.",
        };
      }
      return {
        ok: false,
        reason: "invalid",
        message: "License verification failed. Please check your credentials.",
      };
    }

    const license = mapActivationPayload((payload ?? {}) as PolarActivationPayload);
    if (!isLicenseActive(license.status, license.expiresAt)) {
      return {
        ok: false,
        reason: "revoked",
        message: "Your license has expired or been suspended. Please renew to continue.",
      };
    }

    return { ok: true, license };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Polar license heartbeat network failure", { message });
    return {
      ok: false,
      reason: "network",
      message: isNetworkError(err)
        ? "Could not reach the license server."
        : message,
    };
  }
}
