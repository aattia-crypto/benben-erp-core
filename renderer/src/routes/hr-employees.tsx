import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/ui-bits";
import {
  CreateEmployeeDialog,
  EMPTY_EMPLOYEE_FORM,
  type CreateEmployeeFormState,
} from "@/components/CreateEmployeeDialog";
import { ExportMenu } from "@/components/ExportMenu";
import { canExportReports } from "@/lib/rbac";
import {
  createEmployee,
  fetchEmployees,
  isHrDesktopAvailable,
  type EmployeeDto,
} from "@/lib/hr-bridge";

export const Route = createFileRoute("/hr-employees")({
  head: () => ({ meta: [{ title: "Employees — HR / Payroll — Benben ERP" }] }),
  component: HrEmployeesPage,
});

function HrEmployeesPage() {
  const desktop = isHrDesktopAvailable();
  const [rows, setRows] = useState<EmployeeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<CreateEmployeeFormState>(EMPTY_EMPLOYEE_FORM);

  const reload = useCallback(async () => {
    if (!desktop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await fetchEmployees());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [desktop]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const wageLabel =
    form.payType === "SALARIED"
      ? "Base wage (per pay period gross)"
      : "Base wage (hourly rate)";

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!desktop) {
      toast.error("Employees require the Benben desktop app.");
      return;
    }
    const wage = Number(form.baseWage);
    if (!form.baseWage.trim() || !Number.isFinite(wage) || wage <= 0) {
      toast.error("Enter a base wage greater than zero.");
      return;
    }
    try {
      await createEmployee({
        name: form.name,
        jobTitle: form.jobTitle,
        payType: form.payType,
        taxClassification: form.taxClassification,
        baseWage: wage,
        status: form.status,
      });
      toast.success("Employee created.");
      setForm(EMPTY_EMPLOYEE_FORM);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create employee.");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employees"
        subtitle="W-2 and 1099 workers · hourly or salaried compensation for payroll calculation"
        actions={
          canExportReports() ? (
            <ExportMenu
              filenameBase="hr-employees"
              columns={[
                { key: "name", label: "Name" },
                { key: "jobTitle", label: "Job title" },
                { key: "payType", label: "Pay type" },
                { key: "taxClassification", label: "Tax class" },
                { key: "baseWage", label: "Base wage", align: "right" },
                { key: "status", label: "Status" },
              ]}
              rows={rows.map((r) => ({ ...r }))}
              meta={{ title: "Employees" }}
            />
          ) : undefined
        }
      />

      {!desktop && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Open this page in the Benben desktop app to manage employees in your local database.
          </p>
        </Panel>
      )}

      {desktop && (
        <Panel title="Add employee">
          <CreateEmployeeDialog
            value={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={onCreate}
            wageLabel={wageLabel}
          />
        </Panel>
      )}

      <Panel title="Employee list">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No employees yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Job title</th>
                  <th className="py-2 pr-3">Pay type</th>
                  <th className="py-2 pr-3">Tax</th>
                  <th className="py-2 pr-3">Base wage</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.jobTitle || "—"}</td>
                    <td className="py-2 pr-3">{r.payType === "SALARIED" ? "Salaried" : "Hourly"}</td>
                    <td className="py-2 pr-3">{r.taxClassification}</td>
                    <td className="py-2 pr-3 tabular-nums">${r.baseWage.toFixed(2)}</td>
                    <td className="py-2">{r.status}</td>
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
