import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, fmtMoney, fmtNum, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import type { ProductionBatch } from "@/lib/mock-data";
import {
  createBatch,
  createBomVersion,
  getBatches,
  getBoms,
  getLaborEntries,
  getMaterialUsage,
  recordLabor,
  recordMaterialUsage,
  subscribeManufacturing,
  updateBatchStatus,
  updateStageStatus,
} from "@/lib/manufacturing-store";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { BomCreateDialog } from "@/components/BomCreateDialog";
import { BlindSpotAlertCard } from "@/components/BlindSpotAlertCard";
import { getEntities } from "@/lib/crm-store";
import { useBlindSpotAlerts } from "@/hooks/useBlindSpotAlerts";
import { CheckCircle2, Circle, CircleDashed, Loader2 } from "lucide-react";

export const Route = createFileRoute("/manufacturing")({
  head: () => ({
    meta: [
      { title: "Manufacturing — Benben ERP" },
      { name: "description", content: "Production batches, BOM, WIP tracking, and stage costing." },
    ],
  }),
  component: Manufacturing,
});

function StageIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (status === "in_progress") return <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />;
  if (status === "blocked") return <Circle className="h-3.5 w-3.5 text-danger" />;
  return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />;
}

function BatchDetail({ batch }: { batch: ProductionBatch }) {
  const { items } = useProductCatalog();
  const activeItems = items.filter((i) => i.status === "active");
  const [consumeSku, setConsumeSku] = useState("");
  const [consumeQty, setConsumeQty] = useState(1);
  const usage = getMaterialUsage(batch.id);
  const labor = getLaborEntries(batch.id);
  const completed = batch.stages.filter((s) => s.status === "completed").length;
  const batchClient = getEntities().find(
    (e) => e.name.toLowerCase() === batch.client.toLowerCase() || e.code === batch.client,
  );
  const { alerts: blindSpotAlerts, loading: blindSpotLoading } = useBlindSpotAlerts({
    entityId: batchClient?.id,
    customerCode: batchClient?.code,
    sku: consumeSku || undefined,
  });

  function submitConsumption() {
    if (!consumeSku) {
      toast.error("Select a component SKU from inventory.");
      return;
    }
    if (consumeQty <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }
    recordMaterialUsage(batch.id, consumeSku, consumeQty);
    toast.success(`Recorded ${consumeQty} × ${consumeSku}.`);
    setConsumeQty(1);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-erp-readonly p-3">
          <ErpFieldLabel>Cycle</ErpFieldLabel>
          <div className="mt-1 text-sm font-semibold">{batch.cycleMonths} months</div>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <ErpFieldLabel>Progress</ErpFieldLabel>
          <div className="mt-1 text-sm font-semibold">
            {completed} / {batch.stages.length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface p-3">
          <ErpFieldLabel>WIP value</ErpFieldLabel>
          <div className={`mt-1 ${erp.total}`}>{fmtMoney(batch.wipValue)}</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <ErpFieldLabel>Status</ErpFieldLabel>
          <select
            className={`mt-1 ${erp.input}`}
            value={batch.status}
            onChange={(e) => {
              updateBatchStatus(batch.id, e.target.value as ProductionBatch["status"]);
              toast.success("Batch status updated.");
            }}
          >
            {(["planning", "active", "qa", "completed"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Stage</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Labor $</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {batch.stages.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{s.name}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <StageIcon status={s.status} />
                  {s.status.replace("_", " ")}
                </span>
              </td>
              <td className={`px-3 py-2 text-right ${erp.financial}`}>{fmtMoney(s.laborCost)}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="text-xs text-brand"
                  onClick={() => {
                    updateStageStatus(batch.id, s.id, "in_progress");
                    recordLabor(batch.id, s.id, 8);
                    toast.success("Labor recorded.");
                  }}
                >
                  +8h labor
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Material usage">
          <BlindSpotAlertCard alerts={blindSpotAlerts} loading={blindSpotLoading} />
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1">
              <ErpFieldLabel>Component SKU</ErpFieldLabel>
              <select
                className={`mt-1 ${erp.input}`}
                value={consumeSku}
                onChange={(e) => setConsumeSku(e.target.value)}
              >
                <option value="">Select from inventory…</option>
                {activeItems.map((item) => (
                  <option key={item.id} value={item.sku}>
                    {item.sku} — {item.name} (on hand: {item.onHand})
                  </option>
                ))}
              </select>
            </label>
            <label className="w-24">
              <ErpFieldLabel>Qty</ErpFieldLabel>
              <input
                type="number"
                min={0}
                step="any"
                className={`mt-1 ${erp.input}`}
                value={consumeQty}
                onChange={(e) => setConsumeQty(Number(e.target.value))}
              />
            </label>
            <button type="button" className={erp.secondaryBtn} onClick={submitConsumption}>
              Record consumption
            </button>
          </div>
          <ul className="text-xs text-muted-foreground">
            {usage.length === 0 && <li>No usage logged.</li>}
            {usage.map((u) => (
              <li key={u.id}>
                {u.sku} × {u.qty} · {new Date(u.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Labor log">
          <ul className="text-xs text-muted-foreground">
            {labor.length === 0 && <li>No labor entries.</li>}
            {labor.map((l) => (
              <li key={l.id}>
                {l.hours}h @ ${l.rate}/h · {new Date(l.at).toLocaleString()}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Manufacturing() {
  const [, tick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"wip" | "bom">("wip");
  const [showNew, setShowNew] = useState(false);
  const [showBom, setShowBom] = useState(false);
  const [form, setForm] = useState({ product: "", client: "", units: 100, cycleMonths: 12, expectedCompletion: "" });

  useEffect(() => subscribeManufacturing(() => tick((n) => n + 1)), []);

  const batches = getBatches();
  const boms = getBoms();
  const batch = batches.find((b) => b.id === (selected ?? batches[0]?.id)) ?? batches[0] ?? null;

  function submitBatch() {
    if (!form.product.trim() || !form.client.trim()) {
      toast.error("Product and client are required.");
      return;
    }
    if (!form.expectedCompletion) {
      toast.error("Expected completion date is required.");
      return;
    }
    const b = createBatch(form);
    setSelected(b.id);
    setShowNew(false);
    toast.success(`Batch ${b.code} created.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manufacturing & WIP"
        subtitle="Production batches, bill of materials, material consumption, and labor tracking."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportToolbar
              filenameBase="production-batches"
              columns={[
                { key: "code", label: "Batch" },
                { key: "product", label: "Product" },
                { key: "client", label: "Client" },
                { key: "status", label: "Status" },
                { key: "wipValue", label: "WIP", align: "right", format: (v) => fmtMoney(Number(v)) },
              ]}
              rows={batches.map((b) => ({ ...b }))}
              meta={{ title: "Production Batches" }}
            />
            <button type="button" className={erp.actionBtn} onClick={() => setShowNew(true)}>
              + New Batch
            </button>
          </div>
        }
      />

      <div className="flex gap-2">
        {(["wip", "bom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1 text-xs font-medium uppercase ${
              tab === t ? "bg-erp-action text-erp-action-fg" : "border border-border bg-card text-muted-foreground"
            }`}
          >
            {t === "wip" ? "WIP & Batches" : "Bill of Materials"}
          </button>
        ))}
      </div>

      {tab === "bom" ? (
        <Panel title="BOM versions" padded={false}>
          <table className="w-full text-sm">
            <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">BOM code</th>
                <th className="px-4 py-2 text-left">Finished good</th>
                <th className="px-4 py-2 text-left">Version</th>
                <th className="px-4 py-2 text-left">Effective</th>
                <th className="px-4 py-2 text-right">Lines</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {boms.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{b.bomCode}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.productSku}</div>
                  </td>
                  <td className="px-4 py-2">{b.version}</td>
                  <td className="px-4 py-2 text-muted-foreground">{b.effectiveFrom}</td>
                  <td className="px-4 py-2 text-right">{b.lines.length}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-brand"
                      onClick={() => {
                        createBomVersion(b.productSku, b.lines, "Revision");
                        toast.success("New BOM version created.");
                      }}
                    >
                      New version
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border p-4">
            <button type="button" className={erp.actionBtn} onClick={() => setShowBom(true)}>
              + New BOM
            </button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Panel title="Production batches" padded={false}>
            <ul className="divide-y divide-border">
              {batches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(b.id)}
                    className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left ${
                      (selected ?? batches[0]?.id) === b.id ? "bg-brand/5" : "hover:bg-surface"
                    }`}
                  >
                    <div className="flex w-full justify-between">
                      <span className="font-mono text-xs">{b.code}</span>
                      <Pill tone={b.status === "active" ? "brand" : "neutral"}>{b.status}</Pill>
                    </div>
                    <div className="text-sm font-medium">{b.product}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.client} · {fmtNum(b.units)} units
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {batch ? (
            <Panel title={`${batch.code} — ${batch.product}`}>
              <BatchDetail batch={batch} />
            </Panel>
          ) : (
            <Panel title="No batch">
              <p className="text-sm text-muted-foreground">Create a production batch to begin WIP tracking.</p>
            </Panel>
          )}
        </div>
      )}

      <BomCreateDialog
        open={showBom}
        onOpenChange={setShowBom}
        onSaved={() => toast.success("BOM saved.")}
      />

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5">
            <h3 className="font-semibold">New production batch</h3>
            <div className="mt-4 space-y-3">
              {(["product", "client"] as const).map((k) => (
                <label key={k} className="block">
                  <ErpFieldLabel>{k}</ErpFieldLabel>
                  <input
                    className={`mt-1 ${erp.input}`}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label className="block">
                <ErpFieldLabel>Units</ErpFieldLabel>
                <input
                  type="number"
                  className={`mt-1 ${erp.input}`}
                  value={form.units}
                  onChange={(e) => setForm({ ...form, units: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <ErpFieldLabel>Expected completion</ErpFieldLabel>
                <input
                  type="date"
                  className={`mt-1 ${erp.input}`}
                  value={form.expectedCompletion}
                  onChange={(e) => setForm({ ...form, expectedCompletion: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={erp.secondaryBtn} onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button type="button" className={erp.actionBtn} onClick={submitBatch}>
                Create batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
