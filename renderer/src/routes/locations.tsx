import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, erp, ErpFieldLabel } from "@/components/ui-bits";
import {
  addLocation,
  archiveLocation,
  getAllLocations,
  getWarehouses,
  subscribeLocations,
  updateLocation,
  type LocationKind,
  type StockLocation,
} from "@/lib/location-store";
import { isAdmin } from "@/lib/rbac";

export const Route = createFileRoute("/locations")({
  head: () => ({
    meta: [{ title: "Stores & Locations — Benben ERP" }],
  }),
  component: LocationsPage,
});

const emptyForm = (): Omit<StockLocation, "id" | "active"> => ({
  label: "",
  kind: "store",
  taxState: "CA",
  address: "",
  phone: "",
  warehouseId: getWarehouses()[0]?.id,
  registers: ["Register 1"],
  managerName: "",
});

function LocationsPage() {
  const admin = isAdmin();
  const [, tick] = useState(0);
  const [editing, setEditing] = useState<StockLocation | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => subscribeLocations(() => tick((n) => n + 1)), []);

  const locations = getAllLocations(true);
  const warehouses = getWarehouses();

  function openCreate(kind: LocationKind) {
    setForm({ ...emptyForm(), kind });
    setCreating(true);
    setEditing(null);
  }

  function openEdit(loc: StockLocation) {
    setForm({
      label: loc.label,
      kind: loc.kind,
      taxState: loc.taxState,
      address: loc.address,
      phone: loc.phone,
      warehouseId: loc.warehouseId,
      registers: loc.registers ?? [],
      managerName: loc.managerName,
    });
    setEditing(loc);
    setCreating(false);
  }

  function save() {
    if (!form.label.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (creating) {
      addLocation(form);
      toast.success("Location created.");
    } else if (editing) {
      updateLocation(editing.id, form);
      toast.success("Location updated.");
    }
    setCreating(false);
    setEditing(null);
  }

  if (!admin) {
    return (
      <Panel title="Access restricted">
        <p className="text-sm text-muted-foreground">Only administrators can manage stores and warehouses.</p>
        <Link to="/settings" className="mt-2 inline-block text-sm text-brand">
          Back to settings
        </Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stores & locations"
        subtitle="Configure retail stores, warehouses, tax defaults, registers, and site managers for POS and inventory."
        actions={
          <div className="flex gap-2">
            <button type="button" className={erp.secondaryBtn} onClick={() => openCreate("warehouse")}>
              + Warehouse
            </button>
            <button type="button" className={erp.actionBtn} onClick={() => openCreate("store")}>
              + Store
            </button>
          </div>
        }
      />

      {(creating || editing) && (
        <Panel title={creating ? "New location" : `Edit ${editing?.label}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <ErpFieldLabel>Name</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </label>
            <label className="block">
              <ErpFieldLabel>Type</ErpFieldLabel>
              <select
                className={`mt-1 ${erp.input}`}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as LocationKind })}
              >
                <option value="store">Store</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </label>
            <label className="block">
              <ErpFieldLabel>Tax state (US)</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                value={form.taxState ?? ""}
                onChange={(e) => setForm({ ...form, taxState: e.target.value.toUpperCase().slice(0, 2) })}
              />
            </label>
            {form.kind === "store" && (
              <label className="block">
                <ErpFieldLabel>Linked warehouse</ErpFieldLabel>
                <select
                  className={`mt-1 ${erp.input}`}
                  value={form.warehouseId ?? ""}
                  onChange={(e) => setForm({ ...form, warehouseId: e.target.value || undefined })}
                >
                  <option value="">— none —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block sm:col-span-2">
              <ErpFieldLabel>Address</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <label className="block">
              <ErpFieldLabel>Manager</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                value={form.managerName ?? ""}
                onChange={(e) => setForm({ ...form, managerName: e.target.value })}
              />
            </label>
            <label className="block">
              <ErpFieldLabel>Registers (comma-separated)</ErpFieldLabel>
              <input
                className={`mt-1 ${erp.input}`}
                value={(form.registers ?? []).join(", ")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    registers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className={erp.actionBtn} onClick={save}>
              Save
            </button>
            <button
              type="button"
              className={erp.secondaryBtn}
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Panel>
      )}

      <Panel title="Active & archived sites" padded={false}>
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Tax</th>
              <th className="px-4 py-2 text-left">Warehouse</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No locations configured. Add a warehouse, then your first store.
                </td>
              </tr>
            )}
            {locations.map((loc) => (
              <tr key={loc.id} className={`border-t border-border ${!loc.active ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-medium">{loc.label}</td>
                <td className="px-4 py-2 capitalize">{loc.kind}</td>
                <td className="px-4 py-2">{loc.taxState ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {warehouses.find((w) => w.id === loc.warehouseId)?.label ?? "—"}
                </td>
                <td className="px-4 py-2">{loc.active ? "Active" : "Archived"}</td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button type="button" className="text-xs text-brand" onClick={() => openEdit(loc)}>
                    Edit
                  </button>
                  {loc.active && (
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() => {
                        archiveLocation(loc.id);
                        toast.success("Location archived.");
                      }}
                    >
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
