import fs from "node:fs";
import path from "node:path";

import { getAppDataRoot } from "../utils/paths";
import { logger } from "../utils/logger";

export type BackupKind = "manual" | "scheduled";

export type BackupPolicy = {
  autoBackupEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  retentionDays: number;
  lastAutoBackupAt: string | null;
  lastBackupStatus: "ok" | "failed" | "never";
  lastBackupError: string | null;
  lastVerifiedAt: string | null;
};

const CONFIG_NAME = "backup-policy.json";

const DEFAULT_POLICY: BackupPolicy = {
  autoBackupEnabled: true,
  intervalHours: 24,
  retentionCount: 14,
  retentionDays: 30,
  lastAutoBackupAt: null,
  lastBackupStatus: "never",
  lastBackupError: null,
  lastVerifiedAt: null,
};

function configPath(): string {
  return path.join(getAppDataRoot(), CONFIG_NAME);
}

export function readBackupPolicy(): BackupPolicy {
  const p = configPath();
  if (!fs.existsSync(p)) return { ...DEFAULT_POLICY };
  try {
    return { ...DEFAULT_POLICY, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function writeBackupPolicy(patch: Partial<BackupPolicy>): BackupPolicy {
  const next = { ...readBackupPolicy(), ...patch };
  fs.mkdirSync(getAppDataRoot(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function writeBackupManifest(
  backupDir: string,
  manifest: {
    kind: BackupKind;
    verified: boolean;
    bytes: number;
    engine?: string;
    format?: string;
    database?: string;
    host?: string;
    port?: number;
  },
): void {
  try {
    fs.writeFileSync(
      path.join(backupDir, "manifest.json"),
      JSON.stringify({ ...manifest, createdAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } catch (err) {
    logger.warn("Could not write backup manifest", err);
  }
}

export function readBackupManifest(backupDir: string): { kind: BackupKind; verified: boolean } | null {
  const p = path.join(backupDir, "manifest.json");
  if (!fs.existsSync(p)) return { kind: "manual", verified: false };
  try {
    const m = JSON.parse(fs.readFileSync(p, "utf8")) as { kind?: BackupKind; verified?: boolean };
    return { kind: m.kind ?? "manual", verified: !!m.verified };
  } catch {
    return null;
  }
}
