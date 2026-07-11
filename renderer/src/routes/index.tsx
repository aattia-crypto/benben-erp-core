import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatCard, Panel, Pill, KpiGrid, fmtMoney, fmtNum, erp } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { getBatches, subscribeManufacturing } from "@/lib/manufacturing-store";
import { getJournal, subscribeGl } from "@/lib/gl-store";
import { getArDashboard, subscribeAr } from "@/lib/ar-store";
import { getApDashboard, subscribeAp } from "@/lib/ap-store";
import { subscribeErp } from "@/lib/erp-sync";
import { useCompanyName } from "@/hooks/use-workspace";
import { ArrowUpRight, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Benben ERP" },
      { name: "description", content: "Operational overview: WIP value, active batches, AR/AP, yield." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const companyName = useCompanyName();
  const [, tick] = useState(0);
  const { forecast } = useProductCatalog();

  useEffect(() => {
    const unsubs = [
      subscribeManufacturing(() => tick((n) => n + 1)),
      subscribeGl(() => tick((n) => n + 1)),
      subscribeAr(() => tick((n) => n + 1)),
      subscribeAp(() => tick((n) => n + 1)),
      subscribeErp(() => tick((n) => n + 1)),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const storeBatches = getBatches();
  const storeJournal = getJournal();
  const batches = storeBatches;
  const journal = storeJournal;
  const lowStock = forecast.filter((f) => f.monthly[5] < f.safetyStock).length;
  const arDash = getArDashboard();
  const apDash = getApDashboard();
  const activeBatches = batches.filter((b) => b.status !== "completed").length;
  const wipValue = batches.reduce((sum, batch) => sum + batch.wipValue, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${companyName} · Operations Dashboard`}
        subtitle="Live snapshot across manufacturing, finance, and supply chain."
        actions={
          <ExportToolbar
            filenameBase="dashboard"
            columns={[
              { key: "code", label: "Batch" },
              { key: "product", label: "Product" },
              { key: "wipValue", label: "WIP", align: "right", format: (v) => fmtMoney(Number(v)) },
            ]}
            rows={batches.map((b) => ({ code: b.code, product: b.product, wipValue: b.wipValue }))}
            meta={{ title: "Operations Dashboard" }}
          />
        }
      />

      <KpiGrid columns={6}>
        <StatCard accent="financial" label="Open AR" value={fmtMoney(arDash.openBalance)} hint={`${arDash.openCount} invoices`} />
        <StatCard accent="financial" label="Overdue AR" value={fmtMoney(arDash.overdueBalance)} hint="collections" />
        <StatCard accent="financial" label="Open AP" value={fmtMoney(apDash.openBalance)} hint="vendor payables" />
        <StatCard accent="financial" label="WIP Value" value={fmtMoney(wipValue)} hint="PostgreSQL production batches" />
        <StatCard accent="operational" label="Active Batches" value={String(activeBatches)} hint="From Manufacturing & WIP" />
        <StatCard accent="revenue" label="MTD Revenue" value={fmtMoney(arDash.openBalance)} hint="Open AR basis" />
        <StatCard accent="yield" label="Avg Yield" value="97.4%" hint="latest seeded production lots" />
      </KpiGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title="Active Production Batches"
            actions={
              <Link to="/manufacturing" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                Open <ArrowUpRight className="h-3 w-3" />
              </Link>
            }
            padded={false}
          >
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Batch</th>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 text-right font-medium">WIP</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No production batches yet.</td></tr>
                )}
                {batches.map((b) => {
                  const current = b.stages.find((s) => s.status === "in_progress")?.name ?? "—";
                  return (
                    <tr key={b.id} className="border-t border-border hover:bg-surface/60">
                      <td className="px-4 py-2 font-mono text-xs">{b.code}</td>
                      <td className="px-4 py-2">{b.product}</td>
                      <td className="px-4 py-2 text-muted-foreground">{b.client}</td>
                      <td className="px-4 py-2 text-xs">{current}</td>
                      <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(b.wipValue)}</td>
                      <td className="px-4 py-2">
                        <Pill tone={b.status === "active" ? "brand" : b.status === "planning" ? "neutral" : "success"}>
                          {b.status}
                        </Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Recent Journal Entries" padded={false}>
            <ul className="divide-y divide-border">
              {journal.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">No journal entries yet.</li>
              )}
              {journal.slice(0, 5).map((j) => {
                const total = j.lines.reduce((s, l) => s + l.debit, 0);
                return (
                  <li key={j.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{j.ref}</span>
                        <Pill tone="neutral">{j.source}</Pill>
                      </div>
                      <div className="mt-0.5 truncate text-sm">{j.memo}</div>
                    </div>
                    <div className="text-right tabular-nums text-sm">{fmtMoney(total)}</div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Supply Chain Alerts">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-warning/15 text-[oklch(0.45_0.12_75)]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{lowStock} SKUs below safety stock in 6 mo</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Forecast projects gaps based on active work orders. Review the 18-month projection.
                </p>
                <Link to="/supply-chain" className="mt-2 inline-flex text-xs font-medium text-brand hover:underline">
                  View forecast →
                </Link>
              </div>
            </div>
          </Panel>

          <KpiGrid columns={2}>
            <StatCard label="AR Balance" value={fmtMoney(arDash.openBalance)} hint={`${fmtNum(arDash.openCount)} open invoices`} />
            <StatCard label="AP Balance" value={fmtMoney(apDash.openBalance)} hint={`${fmtNum(apDash.scheduledPayments)} scheduled payments`} />
          </KpiGrid>
        </div>
      </div>
    </div>
  );
}
