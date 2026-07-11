import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ExportMenu } from "@/components/ExportMenu";
import { canExportReports } from "@/lib/rbac";
import {
  calculatePayrollRun,
  createPayrollRun,
  fetchPayrollRuns,
  finalizePayrollRun,
  isHrDesktopAvailable,
  type PayrollRunDto,
} from "@/lib/hr-bridge";

export const Route = createFileRoute("/hr-payroll-runs")({
  head: () => ({ meta: [{ title: "Payroll Runs — HR / Payroll — Benben ERP" }] }),
  component: HrPayrollRunsPage,
});

function HrPayrollRunsPage() {
  const desktop = isHrDesktopAvailable();
  const [rows, setRows] = useState<PayrollRunDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchPayrollRuns());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load payroll runs.");
    } finally {
      setLoading(false);
    }
  }, [desktop]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!desktop) return;
    try {
      await createPayrollRun({
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
      });
      toast.success("Payroll run created.");
      setPeriodStart("");
      setPeriodEnd("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create run.");
    }
  }

  async function onCalculate(id: string) {
    setBusyId(id);
    try {
      const result = await calculatePayrollRun(id) as { grossPay?: number; netPay?: number };
      toast.success(`Calculated — gross $${Number(result.grossPay ?? 0).toFixed(2)}`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Calculate failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onFinalize(id: string) {
    setBusyId(id);
    try {
      const result = await finalizePayrollRun(id) as {
        ledger?: { journalEntryId?: string };
      };
      toast.success(`Posted to GL · journal ${result.ledger?.journalEntryId ?? "—"}`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Finalize failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll Runs"
        subtitle="Calculate from approved timecards · finalize posts accrual to General Ledger"
        actions={
          canExportReports() ? (
            <ExportMenu
              filenameBase="hr-payroll-runs"
              columns={[
                { key: "period", label: "Period" },
                { key: "grossPay", label: "Gross", align: "right" },
                { key: "deductions", label: "Deductions", align: "right" },
                { key: "netPay", label: "Net", align: "right" },
                { key: "processed", label: "Status" },
              ]}
              rows={rows.map((r) => ({
                period: `${new Date(r.periodStart).toLocaleDateString()} – ${new Date(r.periodEnd).toLocaleDateString()}`,
                grossPay: r.grossPay,
                deductions: r.deductions,
                netPay: r.netPay,
                processed: r.processed ? "Processed" : "Open",
              }))}
              meta={{ title: "Payroll Runs" }}
            />
          ) : undefined
        }
      />

      {!desktop && (
        <Panel>
          <p className="text-sm text-muted-foreground">Payroll runs require the Benben desktop app.</p>
        </Panel>
      )}

      {desktop && (
        <Panel title="New payroll run">
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <ErpFieldLabel>Period start</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <ErpFieldLabel>Period end</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                required
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className={erp.actionBtn}>
                Create run
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Payroll runs">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3">Gross</th>
                  <th className="py-2 pr-3">Deductions</th>
                  <th className="py-2 pr-3">Net</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">
                      {new Date(r.periodStart).toLocaleDateString()} –{" "}
                      {new Date(r.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">${r.grossPay.toFixed(2)}</td>
                    <td className="py-2 pr-3 tabular-nums">${r.deductions.toFixed(2)}</td>
                    <td className="py-2 pr-3 tabular-nums">${r.netPay.toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.processed ? "Processed" : "Open"}</td>
                    <td className="py-2 space-x-2 text-right">
                      {desktop && !r.processed && (
                        <>
                          <button
                            type="button"
                            className={erp.secondaryBtn}
                            disabled={busyId === r.id}
                            onClick={() => void onCalculate(r.id)}
                          >
                            Calculate
                          </button>
                          <button
                            type="button"
                            className={erp.actionBtn}
                            disabled={busyId === r.id}
                            onClick={() => void onFinalize(r.id)}
                          >
                            Finalize &amp; post to GL
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
