import fs from "node:fs";
import path from "node:path";

import { resolveAppDataRoot } from "./platform";

const SUBDIRS = ["data", "backups", "exports", "imports", "attachments", "logs"] as const;

export type AppSubdir = (typeof SUBDIRS)[number];

const PG_CLUSTER_DIR = ".benben-db";
const LEGACY_PG_CLUSTER_DIR = ".nexuscore-db";

/** Cross-platform app data root — OS-specific via {@link resolveAppDataRoot}. */
export function getAppDataRoot(): string {
  return resolveAppDataRoot();
}

export function getDataDir(): string {
  return path.join(getAppDataRoot(), "data");
}

/** Embedded PostgreSQL cluster directory (PGDATA). */
export function getPostgresClusterPath(): string {
  const root = getAppDataRoot();
  const primary = path.join(root, PG_CLUSTER_DIR);
  const legacy = path.join(root, LEGACY_PG_CLUSTER_DIR);
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(legacy)) return legacy;
  return primary;
}

/** Human-readable database location for status UI. */
export function getDatabasePath(): string {
  return getPostgresClusterPath();
}

/** Active Prisma URL — injected by postgres-lifecycle before connect. */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set. Start embedded PostgreSQL before connecting Prisma.");
  }
  return url;
}

export function getBackupsDir(): string {
  return path.join(getAppDataRoot(), "backups");
}

export function getExportsDir(): string {
  return path.join(getAppDataRoot(), "exports");
}

export function getImportsDir(): string {
  return path.join(getAppDataRoot(), "imports");
}

export function getAttachmentsDir(): string {
  return path.join(getAppDataRoot(), "attachments");
}

export function getLogsDir(): string {
  return path.join(getAppDataRoot(), "logs");
}

/** Local tribal-knowledge video clips (Blind-Spot Ledger). */
export function getLocalMediaRoot(): string {
  return path.join(getAppDataRoot(), "local-media");
}

export function getBlindSpotMediaRoot(): string {
  return path.join(getLocalMediaRoot(), "blindspots");
}

export function getConfigPath(): string {
  return path.join(getAppDataRoot(), "config.json");
}

/** Authoritative offline license / trial state (main process only). */
export function getLicensePath(): string {
  return path.join(getAppDataRoot(), "license.json");
}

/** AES-256-GCM encrypted Polar activation vault (main process only). */
export function getLicenseVaultPath(): string {
  return path.join(getAppDataRoot(), "license.vault.json");
}

export function getSubdir(name: AppSubdir): string {
  return path.join(getAppDataRoot(), name);
}

export function ensureAppDataDirs(): void {
  const root = getAppDataRoot();
  fs.mkdirSync(root, { recursive: true });
  for (const dir of SUBDIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  fs.mkdirSync(getPostgresClusterPath(), { recursive: true });
  fs.mkdirSync(getLocalMediaRoot(), { recursive: true });
}

export function getPathsSnapshot() {
  return {
    root: getAppDataRoot(),
    data: getDataDir(),
    database: getDatabasePath(),
    backups: getBackupsDir(),
    exports: getExportsDir(),
    imports: getImportsDir(),
    attachments: getAttachmentsDir(),
    logs: getLogsDir(),
    config: getConfigPath(),
  };
}
