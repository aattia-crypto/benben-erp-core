/**
 * License activation for onboarding.
 * Open-core defaults to local-first vault activation (no Polar network call).
 * Online Polar validation is optional commercial behavior (VITE_BENBEN_POLAR_ONLINE=1).
 */

const POLAR_ACTIVATE_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta.env.VITE_POLAR_LICENSE_ACTIVATE_URL as string | undefined)?.trim()) ||
  (typeof process !== "undefined" && process.env.VITE_POLAR_LICENSE_ACTIVATE_URL?.trim()) ||
  "https://api.polar.sh/v1/licenses/activate";

const MOCK_ORG_ID = "MOCK_ORG_ID";

const INACTIVE_USER_MESSAGE =
  "Invalid or inactive license key. Please check your credentials and try again.";

export type PolarLicenseCustomer = {
  id: string | null;
  name: string | null;
  email: string | null;
};

export type ActivatedLicense = {
  status: string;
  tier: string | null;
  customer: PolarLicenseCustomer | null;
  expiresAt: string | null;
  activationId: string | null;
  licenseKeyId: string | null;
  raw: unknown;
};

export type ActivateLicenseSuccess = {
  ok: true;
  license: ActivatedLicense;
};

export type ActivateLicenseFailure = {
  ok: false;
  error: string;
};

export type ActivateLicenseResult = ActivateLicenseSuccess | ActivateLicenseFailure;

type PolarCustomerPayload = {
  id?: string;
  name?: string | null;
  email?: string | null;
};

type PolarLicenseKeyPayload = {
  id?: string;
  status?: string;
  benefit_id?: string;
  expires_at?: string | null;
  customer?: PolarCustomerPayload | null;
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
  customer?: PolarCustomerPayload;
};

function readEnvVar(...names: string[]): string | undefined {
  for (const name of names) {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const fromVite = (import.meta.env as Record<string, string | undefined>)[name];
      if (fromVite?.trim()) return fromVite.trim();
    }
    if (typeof process !== "undefined" && process.env[name]?.trim()) {
      return process.env[name]!.trim();
    }
  }
  return undefined;
}

function resolvePolarOrganizationId(): string {
  const configured =
    readEnvVar("NEXT_PUBLIC_POLAR_ORGANIZATION_ID", "VITE_POLAR_ORGANIZATION_ID") ??
    undefined;

  if (!configured) {
    const isDev =
      (typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
      (typeof process !== "undefined" && process.env.NODE_ENV === "development");
    if (isDev) {
      console.warn(
        "[licenseService] NEXT_PUBLIC_POLAR_ORGANIZATION_ID is not set — using MOCK_ORG_ID for development.",
      );
    }
    return MOCK_ORG_ID;
  }

  return configured;
}

function isLicenseActive(status: string | undefined, expiresAt: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  if (!normalized) return false;
  if (["revoked", "disabled", "suspended", "expired", "inactive"].includes(normalized)) {
    return false;
  }
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
  if (payload.benefit?.description?.trim()) return payload.benefit.description.trim();
  if (licenseKey?.benefit_id) return licenseKey.benefit_id;
  return null;
}

function extractCustomer(
  payload: PolarActivationPayload,
  licenseKey: PolarLicenseKeyPayload | undefined,
): PolarLicenseCustomer | null {
  const source = licenseKey?.customer ?? payload.customer;
  if (!source) return null;
  return {
    id: source.id ?? null,
    name: source.name ?? null,
    email: source.email ?? null,
  };
}

function mapActivationPayload(payload: PolarActivationPayload): ActivatedLicense {
  const licenseKey = payload.license_key;
  const status =
    licenseKey?.status ??
    payload.status ??
    (typeof payload.meta?.status === "string" ? payload.meta.status : "unknown");

  return {
    status,
    tier: extractTier(payload, licenseKey),
    customer: extractCustomer(payload, licenseKey),
    expiresAt: licenseKey?.expires_at ?? null,
    activationId: payload.id ?? null,
    licenseKeyId: payload.license_key_id ?? licenseKey?.id ?? null,
    raw: payload,
  };
}

function parseErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const detail = record.detail;
    if (typeof detail === "string" && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        const msg = (first as { msg?: string }).msg;
        if (msg?.trim()) return msg.trim();
      }
    }
    const error = record.error;
    if (typeof error === "string" && error.trim()) return error.trim();
    const message = record.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  if (status === 404 || status === 403 || status === 401 || status === 422) {
    return INACTIVE_USER_MESSAGE;
  }

  return INACTIVE_USER_MESSAGE;
}

/**
 * Activate a license key for onboarding.
 * Open-core: local-first vault entry (no network).
 * Commercial: set VITE_BENBEN_POLAR_ONLINE=1 to call Polar.
 */
export async function activateLicense(licenseKey: string): Promise<ActivateLicenseResult> {
  const trimmedKey = licenseKey.trim();
  if (!trimmedKey) {
    return { ok: false, error: "Enter a license key to continue." };
  }

  if (!isOnlineLicenseValidationEnabled()) {
    return {
      ok: true,
      license: {
        status: "active",
        tier: "local",
        customer: null,
        expiresAt: null,
        activationId: `local-${Date.now()}`,
        licenseKeyId: null,
        raw: { mode: "local-first", keyLength: trimmedKey.length },
      },
    };
  }

  const organizationId = resolvePolarOrganizationId();

  try {
    const response = await fetch(POLAR_ACTIVATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        license_key: trimmedKey,
        organization_id: organizationId,
      }),
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
      return {
        ok: false,
        error: parseErrorMessage(response.status, payload),
      };
    }

    const activation = mapActivationPayload((payload ?? {}) as PolarActivationPayload);
    if (!isLicenseActive(activation.status, activation.expiresAt)) {
      return { ok: false, error: INACTIVE_USER_MESSAGE };
    }

    return { ok: true, license: activation };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (import.meta.env?.DEV) {
      console.warn("[licenseService] Polar activation request failed:", message);
    }
    // Graceful fallback when online validation is isolated/unreachable.
    return {
      ok: true,
      license: {
        status: "active",
        tier: "local",
        customer: null,
        expiresAt: null,
        activationId: `local-fallback-${Date.now()}`,
        licenseKeyId: null,
        raw: { mode: "local-fallback", reason: message, keyLength: trimmedKey.length },
      },
    };
  }
}

/** True when commercial Polar online activation is explicitly enabled. */
export function isOnlineLicenseValidationEnabled(): boolean {
  const flag = readEnvVar("VITE_BENBEN_POLAR_ONLINE", "BENBEN_POLAR_ONLINE");
  return flag === "1" || flag === "true";
}
