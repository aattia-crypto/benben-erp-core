import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FinanceModuleShell } from "@/components/FinanceModuleShell";
import { Panel, fmtMoney, erp } from "@/components/ui-bits";
import { financeApi, financeApiFetch } from "@/lib/finance-api-client";

export const Route = createFileRoute("/finance-assets")({
  head: () => ({ meta: [{ title: "Fixed Assets — Benben ERP" }] }),
  component: FinanceAssetsPage,
});

type Asset = {
  id: string;
  assetTag: string;
  name: string;
  bookValue: number;
  acquisitionCost: number;
  status: string;
};

function FinanceAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await financeApi.assets();
      setAssets(res.assets as Asset[]);
    } catch {
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createSample() {
    setBusy(true);
    try {
      const tag = `FA-${Date.now().toString(36).toUpperCase()}`;
      await financeApiFetch("/api/finance/assets", {
        method: "POST",
        body: JSON.stringify({
          assetTag: tag,
          name: "Sample equipment",
          categoryCode: "GEN",
          acquisitionDate: new Date().toISOString().slice(0, 10),
          acquisitionCost: 12000,
          salvageValue: 1000,
          usefulLifeMonths: 60,
        }),
      });
      toast.success(`Asset ${tag} created`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function runDepreciation() {
    setBusy(true);
    try {
      const res = await financeApiFetch<{ totalDepreciation: number }>("/api/finance/assets/depreciate-run", {
        method: "POST",
        body: "{}",
      });
      toast.success(`Depreciation posted: ${res.totalDepreciation ?? 0}`);
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FinanceModuleShell title="Fixed Assets & Depreciation" subtitle="Asset register and depreciation runs from local PostgreSQL.">
      <Panel title="Actions">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erp.btnPrimary} disabled={busy} onClick={() => void createSample()}>
            Create sample asset
          </button>
          <button type="button" className={erp.btnSecondary} disabled={busy} onClick={() => void runDepreciation()}>
            Run monthly depreciation
          </button>
        </div>
      </Panel>
      <Panel title="Asset register" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Tag</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-right">Cost</th>
              <th className="px-4 py-2 text-right">Book value</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{a.assetTag}</td>
                <td className="px-4 py-2">{a.name}</td>
                <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(a.acquisitionCost)}</td>
                <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(a.bookValue)}</td>
                <td className="px-4 py-2">{a.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </FinanceModuleShell>
  );
}
