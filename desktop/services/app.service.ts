import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

import { getOsPlatform, isWindows, isMacOS, isLinux } from "../utils/platform";
import { getPathsSnapshot } from "../utils/paths";
import { checkDatabaseIntegrity } from "./db-integrity.service";
import { getBackupHealth } from "./backup-scheduler.service";
import { getSystemStatus } from "./system-status.service";
import { getPrisma } from "./database";
import { getMigrationStatusForDiagnostics } from "./migration.service";

export function getAppVersion(): string {
  return app.getVersion();
}

export function getAppPaths() {
  return getPathsSnapshot();
}

export function ping(): { status: string; at: string } {
  return { status: "ok", at: new Date().toISOString() };
}

export async function getAppDiagnostics() {
  const status = await getSystemStatus();
  const dbIntegrity = checkDatabaseIntegrity();
  const backup = getBackupHealth();

  let migrationVersion: string | null = null;
  let appliedMigrations: number = 0;
  try {
    const db = getPrisma();
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1
    `;
    migrationVersion = rows[0]?.migration_name ?? null;
    const count = await db.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) as c FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    appliedMigrations = Number(count[0]?.c ?? 0);
  } catch {
    migrationVersion = null;
  }

  const stampPath = path.join(__dirname, "build-stamp.json");
  let buildStamp: Record<string, unknown> | null = null;
  if (fs.existsSync(stampPath)) {
    try {
      buildStamp = JSON.parse(fs.readFileSync(stampPath, "utf8")) as Record<string, unknown>;
    } catch {
      buildStamp = null;
    }
  }

  return {
    appVersion: getAppVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: getOsPlatform(),
    isWindows: isWindows(),
    isMacOS: isMacOS(),
    isLinux: isLinux(),
    packaged: app.isPackaged,
    buildStamp,
    database: {
      path: status.databasePath,
      schemaVersion: status.schemaVersion,
      migrationVersion,
      appliedMigrations,
      integrity: dbIntegrity,
    },
    financeApiUrl: status.financeApiUrl,
    uiStagedAt: status.uiStagedAt,
    desktopBuildStamp: status.desktopBuildStamp,
    backup,
    migration: getMigrationStatusForDiagnostics(),
  };
}
