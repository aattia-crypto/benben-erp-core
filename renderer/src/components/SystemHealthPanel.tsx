import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Monitor } from "lucide-react";
import { Panel, Pill } from "@/components/ui-bits";
import { isDesktopShell } from "@/lib/desktop-api";
import { financeApi } from "@/lib/finance-api-client";
import type { BenbenSystemStatus } from "@/lib/benben";

type ExtendedHealth = BenbenSystemStatus & {
  prismaConnected?: boolean;
  arApTablesReady?: boolean;
  financeApiReachable?: boolean;
  migrationTableCount?: number;
  lastActivityAt?: string | null;
  overall?: "green" | "yellow" | "red";
};

function statusPill(ok: boolean | undefined, labelOk: string, labelBad: string) {
  if (ok === undefined) return null;
  return ok ? (
    <Pill tone="success">
      <CheckCircle2 className="mr-1 inline h-3 w-3" /> {labelOk}
    </Pill>
  ) : (
    <Pill tone="warning">
      <AlertTriangle className="mr-1 inline h-3 w-3" /> {labelBad}
    </Pill>
  );
}

export function SystemHealthPanel() {
  const [status, setStatus] = useState<ExtendedHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!isDesktopShell()) return;
    setLoading(true);
    setError(null);
    try {
      const base = await window.benben?.system.getStatus();
      let extended: ExtendedHealth = { ...(base ?? {}) } as ExtendedHealth;
      try {
        extended = { ...extended, ...(await financeApi.extendedHealth()) } as ExtendedHealth;
      } catch {
        /* fallback to base only */
      }
      setStatus(extended);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (!isDesktopShell()) return null;

  const overall = status?.overall ?? "yellow";

  return (
    <Panel
      title="Desktop system health"
      actions={
        <button
          type="button"
          className="text-xs text-brand hover:underline"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !status ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <Pill tone={overall === "green" ? "success" : overall === "red" ? "warning" : "brand"}>
            Overall: {overall}
          </Pill>
          <div className="flex flex-wrap items-center gap-2">
            {statusPill(status.uiHasFinanceRoutes, "UI routes OK", "UI outdated")}
            {statusPill(status.financeTablesReady, "Finance DB (GL)", "GL tables missing")}
            {statusPill(status.arApTablesReady, "AR/AP tables OK", "AR/AP migrate pending")}
            {statusPill(status.prismaConnected, "Prisma healthy", "Prisma disconnected")}
            {statusPill(status.financeApiReachable, "Finance API online", "Finance API offline")}
          </div>
          <ul className="space-y-1 text-muted-foreground">
            <li>
              <Monitor className="mr-1 inline h-3.5 w-3.5" />
              UI: {status.uiStagedAt ?? "—"} · build {status.desktopBuildStamp ?? "—"}
            </li>
            <li>
              <Database className="mr-1 inline h-3.5 w-3.5" />
              {status.migrationTableCount ?? "?"} tables · {status.databasePath}
            </li>
            <li>Last activity: {status.lastActivityAt ?? "none"}</li>
            <li>Finance API: {status.financeApiUrl}</li>
          </ul>
        </div>
      )}
    </Panel>
  );
}
