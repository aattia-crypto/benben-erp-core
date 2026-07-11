import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, fmtMoney, erp, ErpFieldLabel } from "@/components/ui-bits";
import { DataSourceBadge } from "@/components/DataSourceBadge";
import { fetchVendorLedgerBridge, type VendorLedgerResult } from "@/lib/ap-bridge";
import { getEntities, hydrateCrmStore, subscribeCrm } from "@/lib/crm-store";
import { isDesktopShell } from "@/lib/desktop-api";
import { isDemoBuild } from "@/lib/demo-build";
import { whenFinanceApiReady } from "@/lib/finance-api-client";

export const Route = createFileRoute("/vendor-ledger")({
  component: VendorLedgerPage,
});

function VendorLedgerPage() {
  const [code, setCode] = useState("V-2210");
  const [data, setData] = useState<VendorLedgerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    void hydrateCrmStore();
    return subscribeCrm(() => tick((n) => n + 1));
  }, []);

  const vendors = getEntities().filter((e) => e.kind === "vendor" || e.kind === "both");
  const normalized = code.trim().toUpperCase();
  const vendor = vendors.find((v) => v.code.toUpperCase() === normalized);

  const load = useCallback(async () => {
    if (!normalized) return;

    if (!isDesktopShell() && !isDemoBuild()) {
      setError("Vendor ledger requires the Benben desktop app and Finance API.");
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ready = await whenFinanceApiReady();
      if (!ready) {
        throw new Error("Finance API is not reachable. Restart the desktop app and try again.");
      }
      setData(await fetchVendorLedgerBridge(normalized));
    } catch (e) {
      setData(null);
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [normalized]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Ledger"
        subtitle="Bills, payments, and payable balance from local PostgreSQL."
        actions={data ? <DataSourceBadge source={data.source} /> : null}
      />

      <Panel title="Vendor">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Select vendor (CRM)</ErpFieldLabel>
            <select
              className={`mt-1 ${erp.input}`}
              value={normalized}
              onChange={(e) => setCode(e.target.value)}
            >
              {vendors.length === 0 ? (
                <option value={normalized}>{normalized || "No vendors seeded"}</option>
              ) : (
                vendors.map((v) => (
                  <option key={v.id} value={v.code}>
                    {v.name} ({v.code})
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <ErpFieldLabel>Or enter vendor code</ErpFieldLabel>
            <input
              className={`mt-1 ${erp.input}`}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="V-2210"
            />
          </label>
        </div>
        {vendor ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {vendor.name} · {vendor.contact} · {vendor.country}
          </p>
        ) : null}
      </Panel>

      {loading && <p className="text-sm text-muted-foreground">Loading vendor ledger…</p>}

      {error && !loading && (
        <Panel title="Could not load ledger">
          <p className="text-sm text-destructive">{error}</p>
          <button type="button" className={`mt-3 ${erp.secondaryBtn}`} onClick={() => void load()}>
            Retry
          </button>
        </Panel>
      )}

      {data && !loading && !error && (
        <>
          <p className="text-lg font-semibold">Open balance: {fmtMoney(data.balance)}</p>

          <Panel title="Bills" padded={false}>
            {data.bills.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No AP bills for this vendor.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Bill</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Due</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bills.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{b.billNumber}</td>
                      <td className="px-4 py-2 capitalize">{b.status}</td>
                      <td className="px-4 py-2">{b.dueDate}</td>
                      <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(b.total)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${erp.financial}`}>
                        {fmtMoney(b.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="Payments" padded={false}>
            {data.payments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No payments recorded for this vendor.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Method</th>
                    <th className="px-4 py-2">Memo</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-2">{p.paidAt || "—"}</td>
                      <td className="px-4 py-2">{p.method}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.memo ?? "—"}</td>
                      <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
