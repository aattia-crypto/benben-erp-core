import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Panel, Pill, StatCard, KpiGrid, fmtMoney, erp } from "@/components/ui-bits";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { useFinanceDashboard } from "@/hooks/use-finance-gl";
import {
  Building2,
  ClipboardList,
  Coins,
  Landmark,
  Percent,
  PiggyBank,
  Receipt,
  TrendingDown,
  Wallet,
  CircleDollarSign,
} from "lucide-react";

export const Route = createFileRoute("/finance-workspace")({
  head: () => ({ meta: [{ title: "Finance Workspace — Benben ERP" }] }),
  component: FinanceWorkspacePage,
});

const links = [
  { to: "/accounting", label: "General Ledger", icon: Landmark },
  { to: "/finance-rev-rec", label: "Rev Rec & WIP Ledger", icon: CircleDollarSign },
  { to: "/ar", label: "Accounts Receivable", icon: Receipt },
  { to: "/ap", label: "Accounts Payable", icon: Wallet },
  { to: "/finance-po-approvals", label: "PO Approvals", icon: ClipboardList },
  { to: "/finance-bank", label: "Bank Reconciliation", icon: Building2 },
  { to: "/finance-assets", label: "Fixed Assets", icon: TrendingDown },
  { to: "/finance-budgets", label: "Budgets", icon: PiggyBank },
  { to: "/finance-tax", label: "Tax Center", icon: Percent },
  { to: "/finance-currency", label: "Multi-Currency", icon: Coins },
] as const;

function FinanceWorkspacePage() {
  const { data, loading, refresh } = useFinanceDashboard();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Workspace"
        subtitle="Live data from local PostgreSQL · bank rec, GL, assets, budgets, tax, and FX."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && <DataSourceBadge source="database" />}
            <button type="button" className={erp.secondaryBtn} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading finance dashboard…</p>
      ) : !data ? (
        <Panel title="Finance API unavailable">
          <p className="text-sm text-muted-foreground">
            Start the Benben desktop app and run <code className="text-xs">npm run build</code> if you
            recently updated. Check Settings → Desktop system health.
          </p>
        </Panel>
      ) : (
        <>
          <KpiGrid columns={4}>
            <StatCard label="Cash (1000)" value={fmtMoney(data.cashBalance)} />
            <StatCard label="Unmatched bank txns" value={String(data.bankReconciliation.unmatched)} />
            <StatCard label="Partial bank matches" value={String(data.bankReconciliation.partial)} />
            <StatCard label="Budget warnings" value={String(data.budgetVariance?.warnCount ?? 0)} />
          </KpiGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Recent GL postings" padded={false}>
              <ul className="divide-y divide-border">
                {data.recentEntries.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-muted-foreground">No journal entries yet.</li>
                ) : (
                  data.recentEntries.map((e) => (
                    <li key={e.id} className="px-4 py-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono text-xs">{e.reference ?? e.id.slice(0, 8)}</span>
                        <Pill tone="brand">{e.source}</Pill>
                      </div>
                      <p className="mt-1 text-muted-foreground">{e.memo}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.entryDate.slice(0, 10)} · {e.lines.length} lines
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </Panel>

            <Panel title="Alerts & summaries">
              <ul className="space-y-2 text-sm">
                {data.bankReconciliation.unmatched > 0 && (
                  <li className="text-warning">
                    {data.bankReconciliation.unmatched} unmatched bank transactions
                  </li>
                )}
                {data.budgetVariance && data.budgetVariance.overCount > 0 && (
                  <li className="text-destructive">
                    {data.budgetVariance.overCount} budget line(s) over plan
                  </li>
                )}
                {data.taxSummary && typeof data.taxSummary === "object" && "totals" in data.taxSummary && (
                  <li>
                    YTD tax collected:{" "}
                    {fmtMoney(
                      Number((data.taxSummary as { totals?: { tax?: number } }).totals?.tax ?? 0),
                    )}
                  </li>
                )}
                {data.depreciationRuns.length > 0 && (
                  <li>Latest depreciation run recorded in database</li>
                )}
              </ul>
            </Panel>
          </div>
        </>
      )}

      <Panel title="Finance modules">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface"
            >
              <l.icon className="h-4 w-4 text-brand" />
              {l.label}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
