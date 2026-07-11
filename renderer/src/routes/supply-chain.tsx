import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, fmtNum } from "@/components/ui-bits";
import { ExportMenu } from "@/components/ExportMenu";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { useRole, inventoryMode } from "@/lib/rbac";
import { adjustStock } from "@/lib/inventory-store";
import { subscribeErp } from "@/lib/erp-sync";
import { Eye, PackageCheck, Pencil } from "lucide-react";

export const Route = createFileRoute("/supply-chain")({
  head: () => ({
    meta: [
      { title: "Supply Chain — Benben ERP" },
      { name: "description", content: "18-month lead-time forecast against active work orders and safety stock." },
    ],
  }),
  component: SupplyChain,
});

function monthLabels(): string[] {
  const now = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return d.toLocaleString("en-US", { month: "short" }) + " " + String(d.getFullYear()).slice(2);
  });
}

function SupplyChain() {
  const labels = monthLabels();
  const role = useRole();
  const mode = inventoryMode(role);
  const { forecast, items } = useProductCatalog();
  const [, tick] = useState(0);

  useEffect(() => subscribeErp(() => tick((n) => n + 1)), []);

  const banner = mode === "read"
    ? { icon: Eye, tone: "muted" as const, label: "Read-Only Inventory · your role can view forecasts but cannot modify stock." }
    : mode === "receive"
      ? { icon: PackageCheck, tone: "ok" as const, label: "Purchasing access · receive updates the shared inventory catalog immediately." }
      : { icon: Pencil, tone: "ok" as const, label: "Full Inventory access · movements sync to all modules in real time." };
  const Icon = banner.icon;

  function handleReceive(sku: string, qty: number) {
    adjustStock(sku, qty, "receive", "Supply chain receive");
    toast.success(`Received ${qty} × ${sku} into inventory.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supply Chain · 18-Month Lead-Time Forecast"
        subtitle={`Demand planning from the shared inventory catalog (${items.length} SKUs). Manage SKUs in Inventory.`}
        actions={
          <ExportMenu
            filenameBase="supply-chain-forecast"
            columns={[
              { key: "sku", label: "SKU" },
              { key: "product", label: "Product" },
              { key: "onHand", label: "On Hand", align: "right" },
              { key: "safetyStock", label: "Safety", align: "right" },
            ]}
            rows={forecast.map((f) => ({
              sku: f.sku,
              product: f.product,
              onHand: f.onHand,
              safetyStock: f.safetyStock,
            }))}
            meta={{ title: "18-Month Forecast", dateRange: labels.slice(0, 3).join(" – ") + " …" }}
          />
        }
      />

      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
        banner.tone === "ok"
          ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-surface text-muted-foreground"
      }`}>
        <Icon className="h-4 w-4" />
        <span>{banner.label}</span>
      </div>
      <Panel padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-surface text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">On Hand</th>
                <th className="px-3 py-2 text-right font-medium">Safety</th>
                {(mode === "receive" || mode === "full") && (
                  <th className="px-3 py-2 text-right font-medium">Receive</th>
                )}
                {labels.map((m) => (
                  <th key={m} className="px-2 py-2 text-right font-medium">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.length === 0 && (
                <tr>
                  <td
                    colSpan={4 + labels.length + (mode === "receive" || mode === "full" ? 1 : 0)}
                    className="px-3 py-8 text-center text-xs text-muted-foreground"
                  >
                    No SKUs in the shared inventory catalog. Add products under Inventory or import data.
                  </td>
                </tr>
              )}
              {forecast.map((f) => (
                <tr key={f.sku} className="border-t border-border hover:bg-surface/60">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-mono">{f.sku}</td>
                  <td className="px-3 py-1.5">{f.product}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(f.onHand)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmtNum(f.safetyStock)}</td>
                  {(mode === "receive" || mode === "full") && (
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleReceive(f.sku, 50)}
                        className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success hover:bg-success/20"
                      >
                        + Receive 50
                      </button>
                    </td>
                  )}
                  {f.monthly.map((v, i) => {
                    const below = v < f.safetyStock;
                    const critical = v <= f.safetyStock * 0.5;
                    return (
                      <td
                        key={i}
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          critical
                            ? "bg-danger/15 text-danger"
                            : below
                            ? "bg-warning/15 text-[oklch(0.45_0.12_75)]"
                            : ""
                        }`}
                      >
                        {fmtNum(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-warning/30" /> Below safety stock
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-danger/30" /> Critical (≤50% safety)
          </span>
        </footer>
      </Panel>
    </div>
  );
}
