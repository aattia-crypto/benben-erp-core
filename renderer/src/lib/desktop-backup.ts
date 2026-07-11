import { isDesktopShell } from "./desktop-api";

export type DesktopBackupEntry = {
  id: string;
  createdAt: string;
  path: string;
  bytes: number;
  kind?: "manual" | "scheduled";
  verified?: boolean;
};

export type BackupHealth = {
  autoBackupEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  retentionDays: number;
  lastAutoBackupAt: string | null;
  lastBackupStatus: "ok" | "failed" | "never";
  lastBackupError: string | null;
  lastVerifiedAt: string | null;
  backupCount: number;
  lastBackup: DesktopBackupEntry | null;
};

export async function desktopCreateBackup(): Promise<
  { ok: true; entry: DesktopBackupEntry } | { ok: false; error: string }
> {
  if (!isDesktopShell()) return { ok: false, error: "Desktop app required" };
  const res = (await window.benben!.backup.create()) as {
    ok?: boolean;
    data?: DesktopBackupEntry;
    error?: string;
  };
  if (res?.ok && res.data) return { ok: true, entry: res.data };
  return { ok: false, error: res?.error ?? "Backup failed" };
}

export async function desktopListBackups(): Promise<DesktopBackupEntry[]> {
  if (!isDesktopShell()) return [];
  const res = (await window.benben!.backup.list()) as {
    ok?: boolean;
    data?: DesktopBackupEntry[];
  };
  return res?.ok && res.data ? res.data : [];
}

export async function desktopRestoreBackup(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isDesktopShell()) return { ok: false, message: "Desktop app required" };
  const res = (await window.benben!.backup.restore(id)) as {
    ok?: boolean;
    data?: { restored: boolean; message: string };
    error?: string;
  };
  if (res?.data) return { ok: res.data.restored, message: res.data.message };
  return { ok: false, message: res?.error ?? "Restore failed" };
}

export async function desktopGetBackupHealth(): Promise<BackupHealth | null> {
  if (!isDesktopShell()) return null;
  const res = (await window.benben!.backup.getHealth()) as { ok?: boolean; data?: BackupHealth };
  return res?.ok && res.data ? res.data : null;
}

export async function desktopSetBackupPolicy(
  patch: Partial<BackupHealth>,
): Promise<BackupHealth | null> {
  if (!isDesktopShell()) return null;
  const res = (await window.benben!.backup.setPolicy(patch)) as { ok?: boolean; data?: BackupHealth };
  return res?.ok && res.data ? res.data : null;
}

export async function desktopVerifyBackup(id: string): Promise<{ ok: boolean; message: string }> {
  if (!isDesktopShell()) return { ok: false, message: "Desktop app required" };
  const res = (await window.benben!.backup.verify(id)) as {
    ok?: boolean;
    data?: { ok: boolean; message: string };
  };
  return res?.data ?? { ok: false, message: "Verify failed" };
}
