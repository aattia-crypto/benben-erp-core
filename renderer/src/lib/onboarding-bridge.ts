/**
 * Onboarding infrastructure checks — database bootstrap and LAN port verification.
 */
import { isDesktopShell } from "./desktop-api";

export type DatabaseBootstrapReport = {
  ok: boolean;
  clusterPath: string;
  wasFreshInstall: boolean;
  message: string;
};

export type NetworkPortReport = {
  available: boolean;
  port: number;
  message: string;
};

const DEFAULT_LAN_PORT = 8080;

function onboardingApi() {
  return typeof window !== "undefined" ? window.benben?.onboarding : undefined;
}

/**
 * Ensure embedded PostgreSQL is initialized under AppData/.benben-db and schema/seed are applied.
 */
export async function checkAndBootstrapDatabase(): Promise<
  | { ok: true; report: DatabaseBootstrapReport }
  | { ok: false; error: string }
> {
  if (!isDesktopShell() || !onboardingApi()?.checkAndBootstrapDatabase) {
    return {
      ok: false,
      error: "Database bootstrap is only available in the desktop application.",
    };
  }

  const res = await onboardingApi()!.checkAndBootstrapDatabase();
  if (!res.ok) {
    return { ok: false, error: res.error ?? "Database bootstrap failed." };
  }

  if (!res.data.ok) {
    return { ok: false, error: res.data.message };
  }

  return { ok: true, report: res.data };
}

/**
 * Test whether TCP port 8080 (default LAN UI) can be bound on this machine.
 */
export async function verifyNetworkPortAvailability(
  port: number = DEFAULT_LAN_PORT,
): Promise<
  | { ok: true; report: NetworkPortReport }
  | { ok: false; error: string }
> {
  if (!isDesktopShell() || !onboardingApi()?.verifyNetworkPort) {
    return {
      ok: false,
      error: "Network port verification is only available in the desktop application.",
    };
  }

  const res = await onboardingApi()!.verifyNetworkPort(port);
  if (!res.ok) {
    return { ok: false, error: res.error ?? "Port verification failed." };
  }

  return { ok: true, report: res.data };
}
