/**
 * Scrapes renderer localStorage operational modules for one-time PostgreSQL migration.
 */
import type { LocalStorageMigrationModules, LocalStorageMigrationSnapshot } from "./migration-types";

const LEGACY_PREFIX = "nexuscore.";

/** Keys exported and archived after successful migration. */
export const OPERATIONAL_STORAGE_KEYS = [
  "benben.inventory.v1",
  "benben.manufacturing.v1",
  "benben.locations.v1",
  "benben.purchasing.v1",
  "benben.sales.v1",
  "benben.crm.v1",
  "benben.crm.pipeline.v1",
  "benben.imports.v1",
  "semiflow.pos.sales.v1",
  "semiflow.pos.queue.v1",
  "benben.pos.ops.v1",
  "benben.pos.loyalty.v1",
  "benben.data_import.history.v1",
  "benben.ar.v1",
  "benben.ap.v1",
  "benben.gl.v1",
] as const;

function readRawKey(key: string): string | null {
  if (typeof window === "undefined") return null;
  const direct = localStorage.getItem(key);
  if (direct) return direct;
  if (key.startsWith("benben.")) {
    return localStorage.getItem(key.replace(/^benben\./, LEGACY_PREFIX));
  }
  return null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = readRawKey(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function isDemoModeActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("benben.demo_mode.v1") === "true";
}

function checksumModules(modules: LocalStorageMigrationModules): string {
  const json = JSON.stringify(modules);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) - hash + json.charCodeAt(i);
    hash |= 0;
  }
  return `fnv1a-${Math.abs(hash).toString(16)}`;
}

export function exportLocalStorageSnapshot(): LocalStorageMigrationSnapshot {
  const inventoryRaw = readJson<{ items?: unknown[]; movements?: unknown[] } | null>(
    "benben.inventory.v1",
    null,
  );
  const ar = readJson<Record<string, unknown>>("benben.ar.v1", {});
  const ap = readJson<Record<string, unknown>>("benben.ap.v1", {});
  const gl = readJson<Record<string, unknown>>("benben.gl.v1", {});
  const posSales = readJson<Record<string, unknown>[]>("semiflow.pos.sales.v1", []);
  const posQueue = readJson<string[]>("semiflow.pos.queue.v1", []);

  const modules: LocalStorageMigrationModules = {
    inventory: inventoryRaw
      ? {
          items: (inventoryRaw.items ?? []) as Record<string, unknown>[],
          movements: (inventoryRaw.movements ?? []) as Record<string, unknown>[],
        }
      : undefined,
    manufacturing: readJson("benben.manufacturing.v1", undefined),
    locations: readJson<Record<string, unknown>[]>("benben.locations.v1", []),
    purchasing: readJson("benben.purchasing.v1", undefined),
    sales: readJson("benben.sales.v1", undefined),
    crm: readJson("benben.crm.v1", undefined),
    crmPipeline: readJson("benben.crm.pipeline.v1", undefined),
    imports: readJson("benben.imports.v1", undefined),
    pos: posSales.length || posQueue.length ? { sales: posSales, queue: posQueue } : undefined,
    posOps: readJson("benben.pos.ops.v1", undefined),
    posLoyalty: readJson("benben.pos.loyalty.v1", undefined),
    dataImportHistory: readJson("benben.data_import.history.v1", undefined),
    finance: { ar, ap, gl },
  };

  if (modules.locations && modules.locations.length === 0) {
    delete modules.locations;
  }

  return {
    exportedAt: new Date().toISOString(),
    isDemoMode: isDemoModeActive(),
    sourceChecksum: checksumModules(modules),
    modules,
  };
}

/** Rename operational keys after verified migration — never delete immediately. */
export function archiveOperationalStorageKeys(migratedAtIso: string): string[] {
  const suffix = migratedAtIso.replace(/[:.]/g, "-");
  const archived: string[] = [];
  for (const key of OPERATIONAL_STORAGE_KEYS) {
    const raw = readRawKey(key);
    if (!raw) continue;
    const archiveKey = `${key}.migrated-${suffix}`;
    localStorage.setItem(archiveKey, raw);
    localStorage.removeItem(key);
    if (key.startsWith("benben.")) {
      localStorage.removeItem(key.replace(/^benben\./, LEGACY_PREFIX));
    }
    archived.push(archiveKey);
  }
  localStorage.setItem("benben.migration.completed.v1", migratedAtIso);
  return archived;
}

export function isMigrationMarkedCompleteLocally(): boolean {
  return !!localStorage.getItem("benben.migration.completed.v1");
}
