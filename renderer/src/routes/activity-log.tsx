import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, Panel, Pill, erp } from "@/components/ui-bits";
import { financeApiFetch } from "@/lib/finance-api-client";
import { isDesktopShell } from "@/lib/desktop-api";

export const Route = createFileRoute("/activity-log")({
  head: () => ({ meta: [{ title: "System Activity Log — Benben ERP" }] }),
  component: ActivityLogPage,
});

type LogRow = {
  logType: string;
  id: string;
  at: string;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  userId?: string | null;
  username?: string | null;
};

function ActivityLogPage() {
  const [filters, setFilters] = useState({
    module: "",
    entityType: "",
    action: "",
    from: "",
    to: "",
  });
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isDesktopShell()) {
      setError("Activity log requires the Benben desktop app.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (filters.module) q.set("module", filters.module);
      if (filters.entityType) q.set("entityType", filters.entityType);
      if (filters.action) q.set("action", filters.action);
      if (filters.from) q.set("from", filters.from);
      if (filters.to) q.set("to", filters.to);
      q.set("limit", "200");
      const data = await financeApiFetch<{ combined?: LogRow[] }>(`/api/finance/activity?${q}`);
      setRows(data.combined ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Activity Log"
        subtitle="Unified audit trail across Finance, HR/Payroll, and Administration — sorted newest first."
      />

      <Panel title="Filters">
        <div className="flex flex-wrap gap-2">
          <select
            className={erp.input}
            value={filters.module}
            onChange={(e) => setFilters({ ...filters, module: e.target.value })}
          >
            <option value="">All modules</option>
            <option value="FINANCE">Finance</option>
            <option value="HR">HR / Payroll</option>
            <option value="ADMIN">Administration</option>
            <option value="SYSTEM">System</option>
            <option value="ar">Finance · AR (legacy)</option>
            <option value="ap">Finance · AP (legacy)</option>
            <option value="gl">Finance · GL (legacy)</option>
          </select>
          <input
            className={erp.input}
            placeholder="Entity type"
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
          />
          <input
            className={erp.input}
            placeholder="Action"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          />
          <input
            type="date"
            className={erp.input}
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
          <input
            type="date"
            className={erp.input}
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
          <button type="button" className={erp.actionBtn} onClick={() => void load()}>
            Apply
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Panel>

      <Panel title="Events" padded={false}>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Module</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.logType}-${r.id}`} className="border-t border-border">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(r.at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.username ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Pill tone={r.logType === "audit" ? "brand" : "success"}>{r.logType}</Pill>
                  </td>
                  <td className="px-4 py-2">{r.module}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.summary ?? "—"}
                    {r.entityType && (
                      <span className="ml-1 text-[10px]">
                        ({r.entityType}
                        {r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ""})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No events match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
