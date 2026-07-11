import fs from "node:fs";
import path from "node:path";

import {
  createBackup,
  listBackups,
  verifyBackup,
  applyRetentionPolicy,
  type BackupEntry,
} from "./backup.service";
import {
  readBackupPolicy,
  writeBackupPolicy,
  type BackupPolicy,
} from "./backup-config.service";
import { logger } from "../utils/logger";

let timer: ReturnType<typeof setInterval> | null = null;

export function getBackupHealth(): BackupPolicy & { backupCount: number; lastBackup: BackupEntry | null } {
  const policy = readBackupPolicy();
  const backups = listBackups();
  return {
    ...policy,
    backupCount: backups.length,
    lastBackup: backups[0] ?? null,
  };
}

export function updateBackupPolicy(patch: Partial<BackupPolicy>): BackupPolicy {
  return writeBackupPolicy(patch);
}

/** Run scheduled backup if interval elapsed. */
export function runScheduledBackupIfDue(): BackupEntry | null {
  const policy = readBackupPolicy();
  if (!policy.autoBackupEnabled) return null;

  const hours = Math.max(1, policy.intervalHours);
  const dueMs = hours * 60 * 60 * 1000;
  const last = policy.lastAutoBackupAt ? new Date(policy.lastAutoBackupAt).getTime() : 0;
  if (Date.now() - last < dueMs) return null;

  try {
    const entry = createBackup("scheduled");
    const verified = verifyBackup(entry.id);
    applyRetentionPolicy();
    writeBackupPolicy({
      lastAutoBackupAt: new Date().toISOString(),
      lastBackupStatus: verified.ok ? "ok" : "failed",
      lastBackupError: verified.ok ? null : verified.message,
      lastVerifiedAt: new Date().toISOString(),
    });
    logger.info("Scheduled backup completed", { id: entry.id });
    return entry;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeBackupPolicy({
      lastBackupStatus: "failed",
      lastBackupError: message,
    });
    logger.error("Scheduled backup failed", err);
    return null;
  }
}

export function startBackupScheduler(): void {
  stopBackupScheduler();
  runScheduledBackupIfDue();
  timer = setInterval(() => {
    runScheduledBackupIfDue();
  }, 15 * 60 * 1000);
  logger.info("Backup scheduler started");
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
