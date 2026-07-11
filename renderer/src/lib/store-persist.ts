/**
 * Shared optimistic-cache persistence helpers for PostgreSQL-backed stores.
 */
import { isDesktopShell } from "./desktop-api";

let volatileBackendWarned = false;

export function isOperationsBackend(): boolean {
  return isDesktopShell() && !!window.benben?.operations;
}

/** Poll until the Electron preload exposes window.benben.operations (post-reload). */
export async function waitForOperationsBackend(timeoutMs = 10_000): Promise<boolean> {
  if (isOperationsBackend()) return true;
  if (!isDesktopShell()) return false;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (isOperationsBackend()) return true;
  }
  return isOperationsBackend();
}

export function warnVolatileOperationsBackend(): void {
  if (volatileBackendWarned || isOperationsBackend()) return;
  volatileBackendWarned = true;
  console.error(
    "[operations] PostgreSQL persistence is unavailable — running in volatile memory only. " +
      "Launch via Electron (npm run dev) so window.benben.operations is present.",
  );
}

export function persistInBackground(
  label: string,
  task: () => Promise<void>,
  rollback: () => void,
  emit: () => void,
): void {
  if (!isOperationsBackend()) {
    warnVolatileOperationsBackend();
    return;
  }
  void task().catch((err) => {
    console.error(`[${label}] persistence failed:`, err);
    rollback();
    emit();
  });
}
