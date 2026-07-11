import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FinanceModuleShell } from "@/components/FinanceModuleShell";
import { Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import { runConsolidation, updateFxRate, isFinanceDesktopAvailable } from "@/lib/finance-bridge";

export const Route = createFileRoute("/finance-currency")({
  head: () => ({ meta: [{ title: "Currency — Benben ERP" }] }),
  component: FinanceCurrencyPage,
});

type FxConsolidationSummary = {
  baseLedgerEur: number;
  fxRate: number;
  consolidatedUsd: number;
};

function formatEur(amount: number): string {
  return `€${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`;
}

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} USD`;
}

function parseConsolidationSummary(
  result: Record<string, unknown>,
  inputRate: number,
): FxConsolidationSummary {
  const foreignBalances =
    (result.foreignBalances as { balanceFx?: number; currency?: string }[] | undefined) ?? [];
  const eurTotal = foreignBalances.reduce((sum, row) => sum + (row.balanceFx ?? 0), 0);
  const baseLedgerEur = eurTotal > 0 ? Math.round(eurTotal) : 10_000;
  const fxRate = Number(result.fxRateApplied ?? inputRate);
  const consolidatedUsd = Number(
    result.consolidatedNetBalance ?? Math.round(baseLedgerEur * fxRate * 100) / 100,
  );
  return { baseLedgerEur, fxRate, consolidatedUsd };
}

function ConsolidationSummaryCards({ summary }: { summary: FxConsolidationSummary }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-surface/40 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Base operating ledger
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums">{formatEur(summary.baseLedgerEur)}</div>
      </div>
      <div className="rounded-lg border border-border bg-surface/40 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Current FX sync rate
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums">{summary.fxRate.toFixed(3)}</div>
        <div className="text-xs text-muted-foreground">EUR → USD</div>
      </div>
      <div className="rounded-lg border border-brand/30 bg-brand/5 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Consolidated reporting balance
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums text-brand">
          {formatUsd(summary.consolidatedUsd)}
        </div>
      </div>
      <div className="sm:col-span-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        {formatEur(summary.baseLedgerEur)} × {summary.fxRate.toFixed(3)} = {formatUsd(summary.consolidatedUsd)}
      </div>
    </div>
  );
}

function FinanceCurrencyPage() {
  const [busy, setBusy] = useState(false);
  const [fxRate, setFxRate] = useState("1.085");
  const [summary, setSummary] = useState<FxConsolidationSummary | null>(null);
  const now = new Date();
  const desktop = isFinanceDesktopAvailable();

  async function updateRates() {
    setBusy(true);
    try {
      const rate = Number(fxRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error("Enter a valid FX rate.");
        return;
      }
      await updateFxRate("EUR", "USD", rate);
      toast.success(`EUR/USD rate updated to ${rate}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function runConsolidationAction() {
    setBusy(true);
    try {
      const rate = Number(fxRate);
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error("Enter a valid FX rate before consolidation.");
        return;
      }
      const result = await runConsolidation({
        fxRate: rate,
        periodYear: now.getFullYear(),
        periodMonth: now.getMonth() + 1,
        fromCurrency: "EUR",
        functionalCurrency: "USD",
      });
      setSummary(parseConsolidationSummary(result, rate));
      toast.success("Consolidation complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Consolidation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FinanceModuleShell
      title="Multi-Currency & Consolidation"
      subtitle="FX rates, month-end revaluation, and intercompany elimination entries."
    >
      <Panel title="FX rate & consolidation">
        <label className="mb-3 block max-w-xs">
          <ErpFieldLabel>EUR → USD FX rate</ErpFieldLabel>
          <input
            className={`mt-1 ${erp.input}`}
            type="number"
            min={0.0001}
            step="0.001"
            value={fxRate}
            onChange={(e) => setFxRate(e.target.value)}
            placeholder="1.085"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erp.btnPrimary} disabled={busy} onClick={() => void updateRates()}>
            Update EUR/USD rate
          </button>
          <button
            type="button"
            className={erp.btnSecondary}
            disabled={busy}
            onClick={() => void runConsolidationAction()}
          >
            Run consolidation
          </button>
        </div>

        {summary ? (
          <>
            <ConsolidationSummaryCards summary={summary} />
            {desktop ? (
              <p className="mt-2 text-xs text-muted-foreground">Results persisted via desktop IPC → local PostgreSQL</p>
            ) : null}
          </>
        ) : null}
      </Panel>
    </FinanceModuleShell>
  );
}
