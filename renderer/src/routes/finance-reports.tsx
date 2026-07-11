import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, erp } from "@/components/ui-bits";
import { ExportMenu } from "@/components/ExportMenu";
import { financeApi, financeHealthCheck } from "@/lib/finance-api-client";
import { isDesktopShell } from "@/lib/desktop-api";
import { isDemoBuild } from "@/lib/demo-build";
import { exportReportPdf } from "@/lib/document-pdf";
import { FileDown } from "lucide-react";

const REPORTS = [
  { id: "trial-balance", label: "Trial Balance" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "profit-loss", label: "Profit & Loss" },
  { id: "ar-aging", label: "AR Aging" },
  { id: "ap-aging", label: "AP Aging" },
  { id: "tax-summary", label: "Tax Summary" },
  { id: "budget-variance", label: "Budget vs Actual" },
] as const;

export const Route = createFileRoute("/finance-reports")({
  head: () => ({ meta: [{ title: "Finance Reports — Benben ERP" }] }),
  component: FinanceReportsPage,
});

function FinanceReportsPage() {
  const [reportId, setReportId] = useState<string>("trial-balance");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    const desktop = isDesktopShell() || isDemoBuild();
    if (!desktop) {
      setError("Reports require the desktop app and Finance API.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let healthy = await financeHealthCheck();
      for (let attempt = 0; attempt < 24 && !healthy; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        healthy = await financeHealthCheck();
      }
      if (!healthy) {
        throw new Error("Finance API is not reachable. Restart the Benben desktop app and try again.");
      }

      const q: Record<string, string> = {};
      if (from) q.from = from;
      if (to) q.to = to;
      setData(await financeApi.report(reportId, q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportId, from, to]);

  const rows =
    data && typeof data === "object" && "rows" in (data as object)
      ? ((data as { rows: Record<string, unknown>[] }).rows ?? [])
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Reports"
        subtitle="Trial balance, financial statements, AR/AP aging, tax, and budget variance."
        actions={
          rows.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={erp.secondaryBtn}
                onClick={async () => {
                  const cols = Object.keys(rows[0] ?? {});
                  try {
                    await exportReportPdf(`${reportId}.pdf`, {
                      title: REPORTS.find((r) => r.id === reportId)?.label ?? reportId,
                      subtitle: `${from} – ${to}`,
                      columns: cols,
                      rows: rows.map((row) => cols.map((c) => String(row[c] ?? ""))),
                    });
                    toast.success("Report PDF downloaded.");
                  } catch {
                    toast.error("Could not generate report PDF.");
                  }
                }}
              >
                <FileDown className="mr-1 inline h-3 w-3" />
                PDF
              </button>
              <ExportMenu
                filenameBase={reportId}
                columns={Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }))}
                rows={rows}
                meta={{ title: reportId }}
              />
            </div>
          ) : null
        }
      />

      <Panel title="Report parameters">
        <div className="flex flex-wrap gap-2">
          <select className={erp.input} value={reportId} onChange={(e) => setReportId(e.target.value)}>
            {REPORTS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <input type="date" className={erp.input} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={erp.input} value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className={erp.actionBtn} onClick={() => void run()} disabled={loading}>
            {loading ? "Running…" : "Run report"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Panel>

      {rows.length > 0 && (
        <Panel title="Results" padded={false}>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-xs uppercase text-muted-foreground">
                <tr>
                  {Object.keys(rows[0] ?? {}).map((k) => (
                    <th key={k} className="px-4 py-2 font-medium">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {Object.keys(rows[0] ?? {}).map((k) => (
                      <td key={k} className="px-4 py-2 text-xs tabular-nums">
                        {String(row[k] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
