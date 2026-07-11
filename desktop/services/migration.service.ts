import fs from "node:fs";
import path from "node:path";

import { getAppDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";
import { createBackup, restoreBackup } from "./backup.service";
import { writeBackupManifest } from "./backup-config.service";
import { getPostgresDataDir } from "./postgres-lifecycle.service";

export type MigrationStatus = {
  lastRunAt: string | null;
  lastSuccess: boolean;
  lastError: string | null;
  preMigrationBackupId: string | null;
  lastMigrationName: string | null;
};

const STATUS_FILE = "migration-status.json";

function statusPath(): string {
  return path.join(getAppDataRoot(), STATUS_FILE);
}

export function readMigrationStatus(): MigrationStatus {
  const p = statusPath();
  const empty: MigrationStatus = {
    lastRunAt: null,
    lastSuccess: true,
    lastError: null,
    preMigrationBackupId: null,
    lastMigrationName: null,
  };
  if (!fs.existsSync(p)) return empty;
  try {
    return { ...empty, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return empty;
  }
}

export function writeMigrationStatus(patch: Partial<MigrationStatus>): MigrationStatus {
  const next = { ...readMigrationStatus(), ...patch };
  fs.mkdirSync(getAppDataRoot(), { recursive: true });
  fs.writeFileSync(statusPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Create pre-schema-change backup when embedded PostgreSQL cluster exists. */
export function createPreMigrationBackup(): string | null {
  const clusterDir = getPostgresDataDir();
  if (!fs.existsSync(path.join(clusterDir, "PG_VERSION"))) return null;

  // First boot after AppData wipe — no application schema yet; backup/rollback would be empty noise.
  if (!fs.existsSync(statusPath())) {
    logger.info("Skipping pre-migration backup on first boot (fresh cluster)");
    return null;
  }

  const entry = createBackup("manual");
  writeBackupManifest(entry.path, { kind: "manual", verified: true, bytes: entry.bytes });
  const marker = path.join(entry.path, "pre-migration.marker");
  fs.writeFileSync(marker, new Date().toISOString(), "utf8");
  logger.info("Pre-migration backup created", { id: entry.id });
  return entry.id;
}

export type MigrationRunResult = {
  success: boolean;
  preMigrationBackupId: string | null;
  error?: string;
};

/**
 * Wraps schema push / migrate with backup + rollback on failure.
 * `runMigrationsFn` is injected to avoid circular import with database.ts.
 */
export async function runMigrationsSafe(
  runMigrationsFn: () => void | Promise<void>,
): Promise<MigrationRunResult> {
  const startedAt = new Date().toISOString();
  let preId: string | null = null;

  try {
    preId = createPreMigrationBackup();
    writeMigrationStatus({
      lastRunAt: startedAt,
      preMigrationBackupId: preId,
      lastSuccess: false,
      lastError: null,
    });

    await runMigrationsFn();

    writeMigrationStatus({
      lastRunAt: startedAt,
      lastSuccess: true,
      lastError: null,
      preMigrationBackupId: preId,
    });
    logger.info("Migrations completed safely", { preId });
    return { success: true, preMigrationBackupId: preId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Migration failed — attempting rollback", { preId, message });

    if (preId) {
      const restored = await restoreBackup(preId);
      if (!restored.restored) {
        logger.error("Rollback failed", { message: restored.message });
      } else {
        logger.info("Database restored from pre-migration backup", { preId });
      }
    }

    writeMigrationStatus({
      lastRunAt: startedAt,
      lastSuccess: false,
      lastError: message,
      preMigrationBackupId: preId,
    });

    return { success: false, preMigrationBackupId: preId, error: message };
  }
}

export function getMigrationStatusForDiagnostics(): MigrationStatus {
  return readMigrationStatus();
}
