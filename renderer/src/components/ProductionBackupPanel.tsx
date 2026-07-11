import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, Pill, erp, ErpFieldLabel } from "@/components/ui-bits";
import {
  desktopCreateBackup,
  desktopListBackups,
  desktopRestoreBackup,
  desktopGetBackupHealth,
  desktopSetBackupPolicy,
  desktopVerifyBackup,
  type DesktopBackupEntry,
  type BackupHealth,
} from "@/lib/desktop-backup";
import { isDesktopShell } from "@/lib/desktop-api";
import { Database, RefreshCcw, RotateCcw, ShieldCheck } from "lucide-react";

export function ProductionBackupPanel() {
  const [backups, setBackups] = useState<DesktopBackupEntry[]>([]);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isDesktopShell()) return;
    setBackups(await desktopListBackups());
    setHealth(await desktopGetBackupHealth());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!isDesktopShell()) {
    return (
      <Panel title="Production Backup (PostgreSQL)">
        <p className="text-sm text-muted-foreground">
          Full PostgreSQL backups are available in the Benben desktop app. Browser preview uses localStorage snapshots above.
        </p>
      </Panel>
    );
  }

  const last = backups[0];

  async function savePolicy(patch: Partial<BackupHealth>) {
    const next = await desktopSetBackupPolicy(patch);
    if (next) {
      setHealth(next);
      toast.success("Backup policy saved.");
    }
  }

  return (
    <Panel
      title="Production Backup (PostgreSQL)"
      actions={
        <button type="button" className={erp.secondaryBtn} onClick={() => void refresh()} disabled={loading}>
          <RefreshCcw className="mr-1 inline h-3 w-3" />
          Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand" />
          <span>
            Last backup (pg_dump):{" "}
            <strong>{last ? new Date(last.createdAt).toLocaleString() : "Never"}</strong>
          </span>
        </div>
        {health && (
          <Pill tone={health.lastBackupStatus === "ok" ? "success" : health.lastBackupStatus === "failed" ? "neutral" : "brand"}>
            Auto: {health.lastBackupStatus}
          </Pill>
        )}
        {last && <Pill tone="success">{(last.bytes / 1024 / 1024).toFixed(2)} MB</Pill>}
      </div>

      {health && (
        <div className="mb-4 rounded-md border border-border bg-surface/50 p-3 text-sm">
          <div className="mb-2 font-medium">Automatic backups</div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={health.autoBackupEnabled}
              onChange={(e) => void savePolicy({ autoBackupEnabled: e.target.checked })}
            />
            Enable scheduled backups
          </label>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label>
              <ErpFieldLabel>Every (hours)</ErpFieldLabel>
              <input
                type="number"
                min={1}
                className={`mt-1 ${erp.input}`}
                value={health.intervalHours}
                onChange={(e) => void savePolicy({ intervalHours: Number(e.target.value) })}
              />
            </label>
            <label>
              <ErpFieldLabel>Keep count</ErpFieldLabel>
              <input
                type="number"
                min={3}
                className={`mt-1 ${erp.input}`}
                value={health.retentionCount}
                onChange={(e) => void savePolicy({ retentionCount: Number(e.target.value) })}
              />
            </label>
            <label>
              <ErpFieldLabel>Max age (days)</ErpFieldLabel>
              <input
                type="number"
                min={7}
                className={`mt-1 ${erp.input}`}
                value={health.retentionDays}
                onChange={(e) => void savePolicy({ retentionDays: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Backups use native pg_dump (custom format) plus config.json. Scheduled backups are rotated
            automatically. Manual backups are never auto-deleted.
          </p>
          {health.lastBackupError && (
            <p className="mt-2 text-xs text-destructive">Last error: {health.lastBackupError}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={erp.actionBtn}
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            const res = await desktopCreateBackup();
            setLoading(false);
            if (res.ok) {
              toast.success("Backup created successfully.");
              await refresh();
            } else toast.error(res.error);
          }}
        >
          Create manual backup
        </button>
      </div>

      {backups.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Available backups</p>
          <ul className="space-y-2 text-sm">
            {backups.slice(0, 10).map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="font-mono text-xs">{b.id}</span>
                <span className="text-muted-foreground capitalize">{b.kind ?? "manual"}</span>
                {b.verified && (
                  <ShieldCheck className="h-3 w-3 text-success" aria-label="Verified" />
                )}
                <span className="text-muted-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={async () => {
                    const v = await desktopVerifyBackup(b.id);
                    toast.message(v.message);
                  }}
                >
                  Verify
                </button>
                <button
                  type="button"
                  className="text-xs text-destructive hover:underline"
                  onClick={() => setRestoreId(b.id)}
                >
                  Restore…
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {restoreId && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Confirm restore</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This will replace your current database with backup <strong>{restoreId}</strong>. You must restart
            Benben after restore.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={erp.actionBtn}
              onClick={async () => {
                const res = await desktopRestoreBackup(restoreId);
                if (res.ok) toast.success(res.message);
                else toast.error(res.message);
                setRestoreId(null);
              }}
            >
              <RotateCcw className="mr-1 inline h-3 w-3" />
              Yes, restore
            </button>
            <button type="button" className={erp.secondaryBtn} onClick={() => setRestoreId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
