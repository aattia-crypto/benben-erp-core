import fs from "node:fs";
import path from "node:path";

import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";

import { getBackupsDir, getConfigPath } from "../utils/paths";
import { logger } from "../utils/logger";
import {
  getPostgresBinDirectory,
  getPostgresRuntimeConfig,
  normalizeRuntimeBindHost,
  POSTGRES_LEGACY_LOOPBACK_HOST,
  resolvePostgresConnectHost,
  resolvePostgresBinary,
  type PostgresRuntimeConfig,
} from "./postgres-lifecycle.service";
import {
  readBackupPolicy,
  readBackupManifest,
  writeBackupManifest,
  writeBackupPolicy,
  type BackupKind,
} from "./backup-config.service";

const execFileAsync = promisify(execFile);

export interface BackupEntry {
  id: string;
  createdAt: string;
  path: string;
  bytes: number;
  kind: BackupKind;
  verified: boolean;
}

/** Custom-format pg_dump artifact (pg_restore compatible). */
const PG_BACKUP_FILENAME = "benben.pg.bak";

function resolveBackupConnectionConfig(): PostgresRuntimeConfig {
  const cfg = getPostgresRuntimeConfig();
  if (cfg) return cfg;

  const url = process.env.DATABASE_URL?.trim();
  if (url?.startsWith("postgresql://")) {
    const parsed = new URL(url);
    return {
      version: 1,
      host: normalizeRuntimeBindHost(parsed.hostname || POSTGRES_LEGACY_LOOPBACK_HOST),
      port: parsed.port ? Number(parsed.port) : 5433,
      database: parsed.pathname.replace(/^\//, "") || "benben",
      user: decodeURIComponent(parsed.username || "benben"),
      password: decodeURIComponent(parsed.password || ""),
      dataDir: "",
      createdAt: "",
    };
  }

  throw new Error(
    "PostgreSQL connection settings are unavailable. Ensure the database has started before creating a backup.",
  );
}

/**
 * Logical backup via unpacked pg_dump.exe (extraResources), using embedded credentials.
 */
function runPgDumpBackup(destFile: string, cfg: PostgresRuntimeConfig): void {
  const pgDump = resolvePostgresBinary("pg_dump");
  if (!fs.existsSync(pgDump)) {
    throw new Error(
      `pg_dump not found (${pgDump}). Expected binaries under ${getPostgresBinDirectory()}.`,
    );
  }

  const connectHost = resolvePostgresConnectHost(cfg);

  logger.info("Running PostgreSQL backup (pg_dump)", {
    pgDump,
    bindHost: cfg.host,
    connectHost,
    port: cfg.port,
    database: cfg.database,
    destFile,
  });

  try {
    const output = execFileSync(
      pgDump,
      [
        "-h",
        connectHost,
        "-p",
        String(cfg.port),
        "-U",
        cfg.user,
        "-d",
        cfg.database,
        "-F",
        "c",
        "-b",
        "-v",
        "-f",
        destFile,
      ],
      {
        env: { ...process.env, PGPASSWORD: cfg.password },
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true,
      },
    );
    if (output?.length) {
      logger.info("pg_dump completed", { output: String(output).slice(-2000) });
    }
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string };
    const detail = execErr.stderr?.trim() || execErr.message || String(err);
    logger.error("pg_dump backup failed", {
      stderr: execErr.stderr?.trim(),
      stdout: execErr.stdout?.trim(),
    });
    throw new Error(`PostgreSQL backup failed: ${detail}`);
  }

  if (!fs.existsSync(destFile)) {
    throw new Error("pg_dump did not produce a backup file.");
  }
  const size = fs.statSync(destFile).size;
  if (size < 100) {
    throw new Error(`PostgreSQL backup file is too small (${size} bytes).`);
  }
}

/** Terminate client sessions so pg_restore --clean can drop/recreate objects. */
async function terminateDatabaseConnections(cfg: PostgresRuntimeConfig): Promise<void> {
  const psql = resolvePostgresBinary("psql");
  if (!fs.existsSync(psql)) {
    throw new Error(`psql not found (${psql}).`);
  }

  const connectHost = resolvePostgresConnectHost(cfg);
  const sql = `
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${cfg.database.replace(/'/g, "''")}'
      AND pid <> pg_backend_pid();
  `.trim();

  await execFileAsync(
    psql,
    [
      "-h",
      connectHost,
      "-p",
      String(cfg.port),
      "-U",
      cfg.user,
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      env: { ...process.env, PGPASSWORD: cfg.password },
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  logger.info("Terminated active PostgreSQL sessions before restore", {
    database: cfg.database,
  });
}

/**
 * Logical restore via bundled pg_restore.exe (mirror of runPgDumpBackup).
 * Expects custom-format dump produced by pg_dump -F c.
 */
async function runPgRestoreBackup(dumpFile: string, cfg: PostgresRuntimeConfig): Promise<void> {
  const pgRestore = resolvePostgresBinary("pg_restore");
  if (!fs.existsSync(pgRestore)) {
    throw new Error(
      `pg_restore not found (${pgRestore}). Expected binaries under ${getPostgresBinDirectory()}.`,
    );
  }

  const connectHost = resolvePostgresConnectHost(cfg);

  logger.info("Running PostgreSQL restore (pg_restore)", {
    pgRestore,
    bindHost: cfg.host,
    connectHost,
    port: cfg.port,
    database: cfg.database,
    dumpFile,
  });

  try {
    const { stdout, stderr } = await execFileAsync(
      pgRestore,
      [
        "-h",
        connectHost,
        "-p",
        String(cfg.port),
        "-U",
        cfg.user,
        "-d",
        cfg.database,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--verbose",
        dumpFile,
      ],
      {
        env: { ...process.env, PGPASSWORD: cfg.password },
        windowsHide: true,
        maxBuffer: 128 * 1024 * 1024,
      },
    );

    if (stdout?.trim()) {
      logger.info("pg_restore stdout", { output: stdout.trim().slice(-2000) });
    }
    if (stderr?.trim()) {
      logger.info("pg_restore stderr", { output: stderr.trim().slice(-2000) });
    }
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string };
    const detail = execErr.stderr?.trim() || execErr.message || String(err);
    logger.error("pg_restore failed", {
      stderr: execErr.stderr?.trim(),
      stdout: execErr.stdout?.trim(),
    });
    throw new Error(`PostgreSQL restore failed: ${detail}`);
  }
}

/** Post-restore sanity check — core tables must exist. */
async function verifyRestoredDatabase(cfg: PostgresRuntimeConfig): Promise<void> {
  const psql = resolvePostgresBinary("psql");
  if (!fs.existsSync(psql)) {
    throw new Error(`psql not found (${psql}).`);
  }

  const connectHost = resolvePostgresConnectHost(cfg);
  const { stdout } = await execFileAsync(
    psql,
    [
      "-h",
      connectHost,
      "-p",
      String(cfg.port),
      "-U",
      cfg.user,
      "-d",
      cfg.database,
      "-tAc",
      'SELECT COUNT(*) FROM "AppMeta";',
    ],
    {
      env: { ...process.env, PGPASSWORD: cfg.password },
      windowsHide: true,
    },
  );

  if (Number(stdout.trim()) < 1) {
    throw new Error("Restore verification failed: AppMeta row missing.");
  }
}

function restoreConfigFromBackup(backupDir: string, configPath: string): boolean {
  const srcConfig = path.join(backupDir, "config.json");
  if (!fs.existsSync(srcConfig)) return false;
  fs.copyFileSync(srcConfig, configPath);
  return true;
}

function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function dirSize(dir: string): number {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

export function createBackup(kind: BackupKind = "manual"): BackupEntry {
  const id = timestampId();
  const dest = path.join(getBackupsDir(), id);
  fs.mkdirSync(dest, { recursive: true });

  const cfg = resolveBackupConnectionConfig();
  const dumpPath = path.join(dest, PG_BACKUP_FILENAME);
  runPgDumpBackup(dumpPath, cfg);

  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.copyFileSync(configPath, path.join(dest, "config.json"));
  }

  const bytes = dirSize(dest);
  const verified = verifyBackup(id).ok;
  writeBackupManifest(dest, {
    kind,
    verified,
    bytes,
    engine: "postgresql",
    format: "pg_dump_custom",
    database: cfg.database,
    host: cfg.host,
    port: cfg.port,
  });

  if (kind === "manual") {
    readBackupPolicy();
    writeBackupPolicy({
      lastBackupStatus: verified ? "ok" : "failed",
      lastBackupError: verified ? null : "Backup verification failed",
      lastVerifiedAt: new Date().toISOString(),
    });
  }

  logger.info("Backup created", { id, dest, bytes, kind, dumpPath });

  return {
    id,
    createdAt: new Date().toISOString(),
    path: dest,
    bytes,
    kind,
    verified,
  };
}

function findPgBackupFile(backupDir: string): string | null {
  const primary = path.join(backupDir, PG_BACKUP_FILENAME);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(backupDir, "benben.dump");
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

export function listBackups(): BackupEntry[] {
  const root = getBackupsDir();
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = path.join(root, e.name);
      const stat = fs.statSync(full);
      const manifest = readBackupManifest(full);
      const verified = verifyBackup(e.name).ok;
      return {
        id: e.name,
        createdAt: stat.mtime.toISOString(),
        path: full,
        bytes: dirSize(full),
        kind: manifest?.kind ?? "manual",
        verified: manifest?.verified ?? verified,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function verifyBackup(id: string): { ok: boolean; message: string } {
  const backupDir = path.join(getBackupsDir(), id);
  const dump = findPgBackupFile(backupDir);
  if (!dump) {
    return { ok: false, message: `Backup ${id} has no PostgreSQL dump (expected ${PG_BACKUP_FILENAME}).` };
  }
  const stat = fs.statSync(dump);
  if (stat.size < 100) {
    return { ok: false, message: "PostgreSQL backup file is too small." };
  }
  return { ok: true, message: "PostgreSQL backup verified (pg_dump custom format)." };
}

/**
 * Remove old scheduled backups only. Manual backups are never auto-deleted.
 */
export function applyRetentionPolicy(): { removed: string[] } {
  const policy = readBackupPolicy();
  const backups = listBackups();
  const scheduled = backups.filter((b) => b.kind === "scheduled");
  const removed: string[] = [];
  const cutoff = Date.now() - policy.retentionDays * 24 * 60 * 60 * 1024;

  const toRemove = new Set<string>();

  scheduled.forEach((b, index) => {
    if (index >= policy.retentionCount) toRemove.add(b.id);
    if (new Date(b.createdAt).getTime() < cutoff) toRemove.add(b.id);
  });

  for (const id of toRemove) {
    const dir = path.join(getBackupsDir(), id);
    if (!fs.existsSync(dir)) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed.push(id);
      logger.info("Removed old scheduled backup", { id });
    } catch (err) {
      logger.warn("Could not remove backup", { id, err });
    }
  }

  return { removed };
}

/**
 * Restore PostgreSQL database (pg_restore) + optional app config.
 * Keeps embedded PostgreSQL running; suspends Prisma pool during restore.
 */
export type RestoreBackupResult = { restored: boolean; message: string };

export async function restoreBackup(id: string): Promise<RestoreBackupResult> {
  const check = verifyBackup(id);
  if (!check.ok) {
    return { restored: false, message: `Cannot restore: ${check.message}` };
  }

  const backupDir = path.join(getBackupsDir(), id);
  const dumpFile = findPgBackupFile(backupDir);
  const configPath = getConfigPath();

  if (!dumpFile) {
    try {
      const configRestored = restoreConfigFromBackup(backupDir, configPath);
      if (!configRestored) {
        return { restored: false, message: "Backup contains no PostgreSQL dump or config.json." };
      }
      logger.info("Backup config restored (no database dump)", { id, backupDir });
      return {
        restored: true,
        message: "Configuration restored from backup. Restart Benben to apply changes.",
      };
    } catch (err) {
      logger.error("Restore failed", err);
      return {
        restored: false,
        message: err instanceof Error ? err.message : "Restore failed",
      };
    }
  }

  const cfg = resolveBackupConnectionConfig();
  let suspended = false;

  try {
    try {
      createBackup("manual");
    } catch (preErr) {
      logger.warn("Pre-restore safety backup failed (continuing)", { preErr });
    }

    const { suspendDatabaseForRestore, resumeDatabaseAfterRestore } = await import("./database");

    await suspendDatabaseForRestore();
    suspended = true;

    await terminateDatabaseConnections(cfg);
    await runPgRestoreBackup(dumpFile, cfg);

    await resumeDatabaseAfterRestore();
    suspended = false;

    await verifyRestoredDatabase(cfg);

    const configRestored = restoreConfigFromBackup(backupDir, configPath);

    logger.info("PostgreSQL backup restored", { id, dumpFile, configRestored });
    return {
      restored: true,
      message:
        `Database restored from ${path.basename(dumpFile)}.` +
        (configRestored ? " Application config restored." : "") +
        " All services reconnected.",
    };
  } catch (err) {
    logger.error("Restore failed", err);

    if (suspended) {
      try {
        const { resumeDatabaseAfterRestore } = await import("./database");
        await resumeDatabaseAfterRestore();
      } catch (reconnectErr) {
        logger.error("Could not reconnect database after failed restore", reconnectErr);
        return {
          restored: false,
          message:
            (err instanceof Error ? err.message : "Restore failed") +
            " Database may be offline — restart Benben.",
        };
      }
    }

    return {
      restored: false,
      message: err instanceof Error ? err.message : "Restore failed",
    };
  }
}
