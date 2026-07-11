import { useEffect, useState } from "react";
import { Panel, Pill, erp } from "@/components/ui-bits";
import { isDesktopShell } from "@/lib/desktop-api";
import { getClientErrors, clearClientErrors } from "@/lib/error-log";

type Diagnostics = {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  packaged: boolean;
  buildStamp: Record<string, unknown> | null;
  database: {
    path: string;
    schemaVersion: number | null;
    migrationVersion: string | null;
    appliedMigrations: number;
    integrity: { ok: boolean; message: string; sizeBytes: number };
  };
  financeApiUrl: string;
  uiStagedAt: string | null;
  desktopBuildStamp: string | null;
  backup: Record<string, unknown>;
};

export function ReleaseDiagnosticsPanel() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const errors = getClientErrors();

  useEffect(() => {
    if (!isDesktopShell()) return;
    void window.benben?.app.getDiagnostics().then((d) => setDiag(d as Diagnostics));
  }, []);

  if (!isDesktopShell()) {
    return (
      <Panel title="Release & diagnostics">
        <p className="text-sm text-muted-foreground">Available in the Benben desktop application.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel title="Release & diagnostics">
        {diag ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">App version</dt>
              <dd className="font-mono font-medium">{diag.appVersion}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Platform</dt>
              <dd>{diag.platform}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Electron / Node</dt>
              <dd className="font-mono text-xs">
                {diag.electronVersion} / {diag.nodeVersion}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Packaged build</dt>
              <dd>{diag.packaged ? "Yes" : "No (dev)"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">UI staged</dt>
              <dd className="font-mono text-xs">{diag.uiStagedAt ?? diag.desktopBuildStamp ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Database</dt>
              <dd className="font-mono text-xs break-all">{diag.database.path}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Schema version</dt>
              <dd>{diag.database.schemaVersion ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest migration</dt>
              <dd className="font-mono text-xs">{diag.database.migrationVersion ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Migrations applied</dt>
              <dd>{diag.database.appliedMigrations}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">DB integrity</dt>
              <dd>
                <Pill tone={diag.database.integrity.ok ? "success" : "neutral"}>
                  {diag.database.integrity.ok ? "OK" : "Check"}
                </Pill>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Finance API</dt>
              <dd className="font-mono text-xs">{diag.financeApiUrl}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Loading diagnostics…</p>
        )}
      </Panel>

      {errors.length > 0 && (
        <Panel
          title="Recent client errors"
          actions={
            <button type="button" className={erp.secondaryBtn} onClick={() => { clearClientErrors(); window.location.reload(); }}>
              Clear
            </button>
          }
        >
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {errors.slice(0, 10).map((e) => (
              <li key={e.id} className="border-b border-border py-1">
                <span className="text-muted-foreground">{new Date(e.at).toLocaleString()}</span> · {e.category}:{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
