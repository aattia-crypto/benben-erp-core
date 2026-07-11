import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FinanceModuleShell } from "@/components/FinanceModuleShell";
import { Panel, erp } from "@/components/ui-bits";
import { calculateSampleTax, isFinanceDesktopAvailable } from "@/lib/finance-bridge";

export const Route = createFileRoute("/finance-tax")({
  head: () => ({ meta: [{ title: "Tax — Benben ERP" }] }),
  component: FinanceTaxPage,
});

function FinanceTaxPage() {
  const [busy, setBusy] = useState(false);
  const [lastTotal, setLastTotal] = useState<number | null>(null);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const desktop = isFinanceDesktopAvailable();

  async function calculate() {
    setBusy(true);
    try {
      const res = await calculateSampleTax({
        taxZoneCode: "US-DEFAULT",
        invoiceRef: `INV-${Date.now()}`,
        amount: 100,
      });
      setLastTotal(res.taxTotal);
      setSnapshotId(res.snapshotId ?? null);
      toast.success(
        `Tax ${res.taxTotal} · Total ${res.grandTotal}${res.snapshotId ? " · Audit snapshot saved" : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Calculate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FinanceModuleShell
      title="Tax Calculation & Compliance"
      subtitle="Jurisdiction-based tax with immutable invoice snapshots for audit."
    >
      <Panel title="Calculate">
        <button type="button" className={erp.btnPrimary} disabled={busy} onClick={() => void calculate()}>
          Sample tax calculation
        </button>
        {lastTotal != null ? (
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p>Last tax total: {lastTotal}</p>
            {snapshotId ? (
              <p>
                Immutable audit snapshot ID: <span className="font-mono">{snapshotId}</span>
              </p>
            ) : null}
            <p className="text-xs">{desktop ? "Persisted via desktop IPC → local PostgreSQL" : "Persisted via Finance API"}</p>
          </div>
        ) : null}
      </Panel>
    </FinanceModuleShell>
  );
}
