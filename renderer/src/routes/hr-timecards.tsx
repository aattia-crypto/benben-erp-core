import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ExportMenu } from "@/components/ExportMenu";
import { canExportReports } from "@/lib/rbac";
import {
  approveTimecard,
  createTimecard,
  fetchEmployees,
  fetchTimecards,
  isHrDesktopAvailable,
  type EmployeeDto,
  type TimecardDto,
} from "@/lib/hr-bridge";

export const Route = createFileRoute("/hr-timecards")({
  head: () => ({ meta: [{ title: "Timecards — HR / Payroll — Benben ERP" }] }),
  component: HrTimecardsPage,
});

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function HrTimecardsPage() {
  const desktop = isHrDesktopAvailable();
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [rows, setRows] = useState<TimecardDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [clockIn, setClockIn] = useState(() => toLocalInput(new Date().toISOString()));
  const [clockOut, setClockOut] = useState("");
  const [totalHours, setTotalHours] = useState("");

  const reload = useCallback(async () => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [emps, cards] = await Promise.all([fetchEmployees(), fetchTimecards()]);
      setEmployees(emps);
      setRows(cards);
      if (!employeeId && emps[0]) setEmployeeId(emps[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load timecards.");
    } finally {
      setLoading(false);
    }
  }, [desktop, employeeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!desktop) return;
    try {
      await createTimecard({
        employeeId,
        clockIn: new Date(clockIn).toISOString(),
        clockOut: clockOut ? new Date(clockOut).toISOString() : null,
        totalHours: totalHours ? Number(totalHours) : undefined,
      });
      toast.success("Timecard logged.");
      setClockOut("");
      setTotalHours("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create timecard.");
    }
  }

  async function onApprove(id: string) {
    try {
      await approveTimecard(id);
      toast.success("Timecard approved.");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve failed.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Timecards"
        subtitle="Log shifts and approve hours before payroll runs"
        actions={
          canExportReports() ? (
            <ExportMenu
              filenameBase="hr-timecards"
              columns={[
                { key: "employeeName", label: "Employee" },
                { key: "clockIn", label: "Clock in" },
                { key: "totalHours", label: "Hours", align: "right" },
                { key: "approved", label: "Approved" },
              ]}
              rows={rows.map((r) => ({
                employeeName: r.employee?.name ?? r.employeeId,
                clockIn: new Date(r.clockIn).toLocaleString(),
                totalHours: r.totalHours,
                approved: r.approved ? "Yes" : "No",
              }))}
              meta={{ title: "Timecards" }}
            />
          ) : undefined
        }
      />

      {!desktop && (
        <Panel>
          <p className="text-sm text-muted-foreground">Timecards require the Benben desktop app.</p>
        </Panel>
      )}

      {desktop && (
        <Panel title="Log timecard">
          <form onSubmit={onCreate} className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <ErpFieldLabel>Employee</ErpFieldLabel>
              <select
                className={`mt-1 ${erp.input}`}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.taxClassification})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <ErpFieldLabel>Clock in</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                type="datetime-local"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <ErpFieldLabel>Clock out (optional)</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                type="datetime-local"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
              />
            </label>
            <label className="block">
              <ErpFieldLabel>Total hours (optional override)</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                type="number"
                min={0}
                step="0.25"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className={erp.actionBtn}>
                Log timecard
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Timecard list">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Employee</th>
                  <th className="py-2 pr-3">Clock in</th>
                  <th className="py-2 pr-3">Hours</th>
                  <th className="py-2 pr-3">Approved</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{r.employee?.name ?? r.employeeId}</td>
                    <td className="py-2 pr-3">{new Date(r.clockIn).toLocaleString()}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.totalHours.toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.approved ? "Yes" : "No"}</td>
                    <td className="py-2 text-right">
                      {!r.approved && desktop && (
                        <button type="button" className={erp.secondaryBtn} onClick={() => void onApprove(r.id)}>
                          Approve
                        </button>
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
