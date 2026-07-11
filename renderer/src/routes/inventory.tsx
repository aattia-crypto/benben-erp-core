import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, Pill, fmtMoney, fmtNum, erp, ErpFieldLabel } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import {
  adjustStock,
  createItem,
  deleteItem,
  findBySkuOrBarcode,
  getInventoryItems,
  getMovements,
  stockValuation,
  subscribeInventory,
  updateItem,
  type InventoryItem,
} from "@/lib/inventory-store";
import { getWarehouses, hydrateLocationStore, subscribeLocations } from "@/lib/location-store";
import { getDemoWarehouseOptions } from "@/lib/demo-data-provider";
import { isDemoBuild } from "@/lib/demo-build";
import { useRole, inventoryMode } from "@/lib/rbac";
import { Plus, Trash2 } from "lucide-react";
import { ScanInput } from "@/components/ScanInput";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Management — Benben ERP" },
      { name: "description", content: "SKU, barcode, warehouse tracking, adjustments, and valuation." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const role = useRole();
  const mode = inventoryMode(role);
  const canEdit = mode === "full";
  const [, tick] = useState(0);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Partial<InventoryItem> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeInventory(() => tick((n) => n + 1)), []);
  useEffect(() => subscribeLocations(() => tick((n) => n + 1)), []);
  useEffect(() => {
    void hydrateLocationStore();
  }, []);

  // Presenter Mode: always merge hardcoded hubs so the create dropdown cannot be empty.
  const warehouses = (() => {
    const live = getWarehouses();
    if (!isDemoBuild()) return live;
    if (live.length > 0) return live;
    return getDemoWarehouseOptions();
  })();
  const defaultWarehouseLabel = warehouses[0]?.label ?? "Central Warehouse Hub";
  const items = getInventoryItems();
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter(
      (i) =>
        !s ||
        i.sku.toLowerCase().includes(s) ||
        i.name.toLowerCase().includes(s) ||
        i.barcode?.toLowerCase().includes(s),
    );
  }, [items, q]);

  const exportRows = filtered.map((i) => ({
    sku: i.sku,
    name: i.name,
    category: i.category,
    onHand: i.onHand,
    reorder: i.reorderLevel,
    unitCost: i.unitCost,
    value: i.onHand * i.unitCost,
    warehouse: i.warehouse,
    location: i.location,
    barcode: i.barcode ?? "",
  }));

  function handleScan(code: string) {
    const hit = findBySkuOrBarcode(code);
    if (!hit) {
      toast.error("No item matched scan code.");
      return;
    }
    setQ(hit.sku);
    toast.success(`Found ${hit.sku} — ${hit.name}`);
  }

  async function saveItem() {
    if (saving) return;
    if (!form?.sku || !form.name) {
      toast.error("SKU and name are required.");
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        const updated = updateItem(form.id, form);
        if (!updated) {
          toast.error("Item not found.");
          return;
        }
        toast.success("Item updated.");
      } else {
        createItem({
          sku: form.sku,
          name: form.name,
          category: form.category ?? "General",
          uom: form.uom ?? "ea",
          onHand: form.onHand ?? 0,
          reorderLevel: form.reorderLevel ?? 0,
          unitCost: form.unitCost ?? 0,
          warehouse: form.warehouse ?? defaultWarehouseLabel,
          location: form.location ?? "—",
          barcode: form.barcode ?? `BC-${form.sku}`,
          qrCode: form.qrCode ?? `QR-${form.sku}`,
          status: form.status ?? "active",
        });
        toast.success("Item created.");
      }
      setForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        subtitle="SKU, barcode/QR, warehouse locations, adjustments, movement history, and stock valuation."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportToolbar
              filenameBase="inventory"
              columns={[
                { key: "sku", label: "SKU" },
                { key: "name", label: "Product" },
                { key: "onHand", label: "On Hand", align: "right" },
                { key: "reorder", label: "Reorder", align: "right" },
                { key: "unitCost", label: "Unit Cost", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "value", label: "Value", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "warehouse", label: "Warehouse" },
              ]}
              rows={exportRows}
              meta={{
                title: "Inventory Report",
                filters: q ? `Search: ${q}` : undefined,
                totals: [{ label: "Total valuation", value: fmtMoney(stockValuation()) }],
              }}
            />
            {canEdit && (
              <button
                type="button"
                className={erp.actionBtn}
                onClick={() =>
                  setForm({ status: "active", uom: "ea", warehouse: defaultWarehouseLabel, location: "A-01" })
                }
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" /> New Item
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Panel>
          <ErpFieldLabel>Stock valuation</ErpFieldLabel>
          <div className={`mt-1 ${erp.total}`}>{fmtMoney(stockValuation())}</div>
        </Panel>
        <Panel>
          <ErpFieldLabel>Active SKUs</ErpFieldLabel>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{items.filter((i) => i.status === "active").length}</div>
        </Panel>
        <Panel>
          <ErpFieldLabel>Scan lookup</ErpFieldLabel>
          <div className="mt-2">
            <ScanInput placeholder="Barcode / QR / SKU" onScan={handleScan} />
          </div>
        </Panel>
      </div>

      <div className="flex gap-2">
        <input
          className={`${erp.input} max-w-xs`}
          placeholder="Search inventory…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Panel padded={false} title="Items">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Reorder</th>
              <th className="px-4 py-2 text-right">Unit cost</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-t border-border hover:bg-surface/50">
                <td className="px-4 py-2 font-mono text-xs">{i.sku}</td>
                <td className="px-4 py-2 font-medium">{i.name}</td>
                <td className={`px-4 py-2 text-right ${i.onHand <= i.reorderLevel ? erp.warning : erp.financial}`}>
                  {fmtNum(i.onHand)} {i.uom}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(i.reorderLevel)}</td>
                <td className={`px-4 py-2 text-right ${erp.financial}`}>{fmtMoney(i.unitCost)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {i.warehouse} / {i.location}
                </td>
                <td className="px-4 py-2">
                  <Pill tone={i.status === "active" ? "success" : "neutral"}>{i.status}</Pill>
                </td>
                {canEdit && (
                  <td className="px-4 py-2 text-right">
                    <button type="button" className="text-xs text-brand hover:underline" onClick={() => setForm(i)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-xs text-danger hover:underline"
                      onClick={() => {
                        if (deleteItem(i.id)) toast.success("Deleted.");
                      }}
                    >
                      <Trash2 className="inline h-3 w-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Recent movements" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">SKU</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {getMovements()
              .slice(0, 15)
              .map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 text-xs">{new Date(m.at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{m.sku}</td>
                  <td className="px-4 py-2 capitalize">{m.type}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.qty}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{m.reason}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Panel>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg">
            <h3 className="text-sm font-semibold">{form.id ? "Edit item" : "New inventory item"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(["sku", "name", "category", "uom", "location", "barcode"] as const).map((k) => (
                <label key={k} className="block">
                  <ErpFieldLabel>{k}</ErpFieldLabel>
                  <input
                    className={`mt-1 ${erp.input}`}
                    value={String(form[k] ?? "")}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    disabled={!!form.id && k === "sku"}
                  />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <ErpFieldLabel>warehouse</ErpFieldLabel>
                <select
                  className={`mt-1 ${erp.input}`}
                  value={form.warehouse ?? defaultWarehouseLabel}
                  onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                >
                  {warehouses.length === 0 ? (
                    <option value={defaultWarehouseLabel}>{defaultWarehouseLabel}</option>
                  ) : (
                    warehouses.map((wh) => (
                      <option key={wh.id} value={wh.label}>
                        {wh.label}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {(["onHand", "reorderLevel", "unitCost"] as const).map((k) => (
                <label key={k} className="block">
                  <ErpFieldLabel>{k}</ErpFieldLabel>
                  <input
                    type="number"
                    className={`mt-1 ${erp.input}`}
                    value={Number(form[k] ?? 0)}
                    onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={erp.secondaryBtn} onClick={() => setForm(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" className={erp.actionBtn} onClick={() => void saveItem()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
              {form.id && form.sku && (
                <button
                  type="button"
                  className={erp.secondaryBtn}
                  onClick={() => {
                    adjustStock(form.sku!, 10, "receive", "Manual adjustment");
                    toast.success("Received +10 units.");
                  }}
                >
                  +10 Receive
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
