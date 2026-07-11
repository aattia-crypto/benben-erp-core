/**
 * Orchestrates localStorage → PostgreSQL cutover on desktop shell boot.
 */
import { isDesktopShell } from "./desktop-api";
import {
  archiveOperationalStorageKeys,
  exportLocalStorageSnapshot,
  isMigrationMarkedCompleteLocally,
} from "./localstorage-export";
import type { MigrationImportResult, MigrationStatusDto } from "./migration-types";

export type MigrationBootstrapResult =
  | { action: "skip"; reason: string }
  | { action: "complete"; moduleCounts?: Record<string, number> }
  | { action: "error"; error: string };

async function getMigrationStatus(): Promise<MigrationStatusDto | null> {
  const api = window.benben?.migration;
  if (!api?.getStatus) return null;
  const res = await api.getStatus();
  if (!res?.ok || !res.data) return null;
  return res.data as MigrationStatusDto;
}

async function importSnapshot(): Promise<MigrationImportResult> {
  const api = window.benben?.migration;
  if (!api?.importSnapshot) {
    return { ok: false, error: "Migration API unavailable." };
  }
  const snapshot = exportLocalStorageSnapshot();
  const res = await api.importSnapshot(snapshot);
  if (!res?.ok) {
    return { ok: false, error: res?.error ?? "Import failed." };
  }
  return (res.data ?? { ok: true }) as MigrationImportResult;
}

/** Returns whether the app should show the /migrating gate route. */
export async function shouldRunMigrationGate(): Promise<boolean> {
  if (!isDesktopShell()) return false;
  if (isMigrationMarkedCompleteLocally()) return false;
  const status = await getMigrationStatus();
  if (!status) return false;
  return status.required && !status.completed;
}

/** Executes export → IPC import → archive keys. */
export async function executeLocalStorageMigration(): Promise<MigrationBootstrapResult> {
  if (!isDesktopShell()) {
    return { action: "skip", reason: "not_desktop" };
  }

  const status = await getMigrationStatus();
  if (status?.completed || isMigrationMarkedCompleteLocally()) {
    return { action: "skip", reason: "already_completed" };
  }

  const result = await importSnapshot();
  if (!result.ok) {
    return { action: "error", error: result.error ?? "Migration import failed." };
  }

  const migratedAt = new Date().toISOString();
  if (!result.skipped) {
    archiveOperationalStorageKeys(migratedAt);
  } else if (result.skipReason === "demo_mode" || result.skipReason === "already_completed") {
    localStorage.setItem("benben.migration.completed.v1", migratedAt);
  }

  return { action: "complete", moduleCounts: result.moduleCounts };
}
