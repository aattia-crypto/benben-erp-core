import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, erp } from "@/components/ui-bits";
import { isHrDesktopAvailable } from "@/lib/hr-bridge";
import { importExternalPayroll } from "@/lib/hr-bridge";
import { isDesktopShell, desktopPickFile } from "@/lib/desktop-api";
import { hasPermission } from "@/lib/permissions-store";

export const Route = createFileRoute("/hr-payroll-config")({
  head: () => ({ meta: [{ title: "Payroll Configuration — Benben ERP" }] }),
  component: HrPayrollConfigPage,
});

function HrPayrollConfigPage() {
  const desktop = isHrDesktopAvailable();
  const canExecute = hasPermission("execute_payroll");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function onImport() {
    if (!desktop || !canExecute) return;
    setBusy(true);
    try {
      let filePath: string | null = null;
      if (isDesktopShell()) {
        filePath = await desktopPickFile([
          { name: "Payroll CSV", extensions: ["csv"] },
          { name: "All files", extensions: ["*"] },
        ]);
      }
      if (!filePath) {
        toast.message("Import cancelled.");
        return;
      }
      const result = await importExternalPayroll(filePath);
      setLastResult(
        `Journal ${result.journalEntryId} · Gross $${result.summary.grossWages.toFixed(2)} · Net $${result.summary.netPay.toFixed(2)}`,
      );
      toast.success(result.duplicate ? "Import already posted (duplicate skipped)" : "External payroll imported to GL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll Configuration"
        subtitle="External provider imports (Gusto, ADP, Paychex) and payroll GL mapping"
      />

      {!desktop && (
        <Panel>
          <p className="text-sm text-muted-foreground">Payroll configuration requires the Benben desktop app.</p>
        </Panel>
      )}

      {desktop && !canExecute && (
        <Panel>
          <p className="text-sm text-warning">Your role does not include execute_payroll permission.</p>
        </Panel>
      )}

      {desktop && canExecute && (
        <Panel title="Import External Payroll Log">
          <p className="mb-3 text-sm text-muted-foreground">
            Upload a summary CSV from Gusto, ADP, Paychex, or similar. Benben maps gross wages, taxes,
            benefits, and net pay, then posts a balanced accrual to the General Ledger with source{" "}
            <span className="font-mono text-xs">EXTERNAL_PAYROLL_IMPORT</span>.
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Recognized headers include: Gross Pay, Employee Taxes, Employer Taxes, Benefits, Net Pay</li>
            <li>Debit: Wages Expense (6300) and Payroll Tax Expense (6310)</li>
            <li>Credit: Payroll Liability (2050)</li>
          </ul>
          <button type="button" className={erp.actionBtn} disabled={busy} onClick={() => void onImport()}>
            {busy ? "Importing…" : "Import External Payroll Log"}
          </button>
          {lastResult && (
            <p className="mt-3 text-sm text-success">{lastResult}</p>
          )}
        </Panel>
      )}
    </div>
  );
}
