import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErpFormDialog } from "@/components/ErpFormDialog";
import { PoLineItemsEditor } from "@/components/PoLineItemsEditor";
import { newLineItem } from "@/components/LineItemsEditor";
import { erp, ErpFieldLabel, fmtMoney } from "@/components/ui-bits";
import { getEntities, subscribeCrm } from "@/lib/crm-store";
import { getSession } from "@/lib/auth-store";
import { createPurchaseOrder, type POStatus } from "@/lib/purchasing-store";
import { getWarehouses } from "@/lib/location-store";

type PoForm = {
  vendorCode: string;
  vendorName: string;
  poNumber: string;
  warehouseId: string;
  expectedDelivery: string;
  taxAmount: number;
  shippingAmount: number;
  notes: string;
  status: "draft" | "submitted";
  lines: ReturnType<typeof newLineItem>[];
};

function vendorOptions() {
  return getEntities().filter((e) => e.kind === "vendor" || e.kind === "both");
}

function emptyPoForm(): PoForm {
  const warehouses = getWarehouses();
  const vendors = vendorOptions();
  return {
    vendorCode: "",
    vendorName: "",
    poNumber: "",
    warehouseId: warehouses[0]?.id ?? "",
    expectedDelivery: "",
    taxAmount: 0,
    shippingAmount: 0,
    notes: "",
    status: "draft",
    lines: [newLineItem()],
  };
}

type PurchaseOrderCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function PurchaseOrderCreateDialog({ open, onOpenChange, onSaved }: PurchaseOrderCreateDialogProps) {
  const [form, setForm] = useState<PoForm>(emptyPoForm);
  const [, tick] = useState(0);
  const warehouses = getWarehouses();
  const vendors = vendorOptions();

  useEffect(() => subscribeCrm(() => tick((n) => n + 1)), []);

  useEffect(() => {
    if (open) setForm(emptyPoForm());
  }, [open]);

  const merchandise = form.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const grandTotal = merchandise + form.taxAmount + form.shippingAmount;

  function validate(): string | null {
    if (!form.vendorCode) return "Select a vendor from CRM.";
    if (form.lines.length === 0) return "Add at least one line item.";
    if (form.lines.some((l) => !l.sku.trim())) return "Each line needs a SKU selected from inventory.";
    if (form.lines.some((l) => l.qty <= 0)) return "Quantities must be greater than zero.";
    if (form.lines.some((l) => l.unitCost < 0)) return "Unit costs cannot be negative.";
    const skus = form.lines.map((l) => l.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) return "Duplicate SKUs are not allowed on one PO.";
    if (!form.expectedDelivery) return "Expected delivery date is required.";
    if (!form.warehouseId) return "Warehouse/location is required.";
    if (vendors.length === 0) return "Create a vendor in CRM before raising a purchase order.";
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const status: POStatus = form.status === "submitted" ? "pending_approval" : "draft";
    const session = getSession();
    createPurchaseOrder({
      poNumber: form.poNumber.trim() || undefined,
      vendorCode: form.vendorCode,
      vendorName: form.vendorName,
      warehouseId: form.warehouseId,
      expectedDelivery: form.expectedDelivery,
      taxAmount: form.taxAmount,
      shippingAmount: form.shippingAmount,
      notes: form.notes.trim() || undefined,
      status,
      requestedByUserId: session?.userId,
      requestedByName: session?.name,
      lines: form.lines.map((l) => ({
        sku: l.sku.trim(),
        description: l.description.trim() || l.sku.trim(),
        qty: l.qty,
        unitCost: l.unitCost,
      })),
    });
    onOpenChange(false);
    onSaved?.();
  }

  function onVendorSelect(code: string) {
    const v = vendors.find((x) => x.code === code);
    setForm({
      ...form,
      vendorCode: code,
      vendorName: v?.name ?? "",
    });
  }

  const validationError = validate();

  return (
    <ErpFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New purchase order"
      description="Select a CRM vendor and inventory SKUs. Save as draft or submit for approval."
      submitLabel={form.status === "submitted" ? "Submit PO" : "Save draft"}
      onSubmit={handleSave}
      submitDisabled={!!validationError}
      size="xl"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Vendor (from CRM)</ErpFieldLabel>
          <select
            className={`mt-1 ${erp.input}`}
            value={form.vendorCode}
            onChange={(e) => onVendorSelect(e.target.value)}
          >
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.code}>
                {v.name} ({v.code})
              </option>
            ))}
          </select>
          {vendors.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No vendors in CRM — add a vendor under CRM → New Entry (role: vendor).
            </p>
          ) : null}
        </label>
        <label className="block">
          <ErpFieldLabel>PO number (optional)</ErpFieldLabel>
          <input
            className={`mt-1 ${erp.input}`}
            value={form.poNumber}
            onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
            placeholder="Auto-generated if blank"
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Warehouse / location</ErpFieldLabel>
          <select
            className={`mt-1 ${erp.input}`}
            value={form.warehouseId}
            onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
          >
            {warehouses.length === 0 ? (
              <option value="">No warehouses configured</option>
            ) : (
              warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block">
          <ErpFieldLabel>Expected delivery</ErpFieldLabel>
          <input
            type="date"
            className={`mt-1 ${erp.input}`}
            value={form.expectedDelivery}
            onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })}
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Tax</ErpFieldLabel>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`mt-1 ${erp.input} ${erp.financial}`}
            value={form.taxAmount}
            onChange={(e) => setForm({ ...form, taxAmount: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Shipping</ErpFieldLabel>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`mt-1 ${erp.input} ${erp.financial}`}
            value={form.shippingAmount}
            onChange={(e) => setForm({ ...form, shippingAmount: Number(e.target.value) })}
          />
        </label>
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Status on save</ErpFieldLabel>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.status === "draft"}
                onChange={() => setForm({ ...form, status: "draft" })}
              />
              Draft
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={form.status === "submitted"}
                onChange={() => setForm({ ...form, status: "submitted" })}
              />
              Submit for approval
            </label>
          </div>
        </label>
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Notes</ErpFieldLabel>
          <textarea
            className={`mt-1 ${erp.input} min-h-[56px]`}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-4">
        <PoLineItemsEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} />
      </div>
      <div className={`mt-3 text-right text-sm ${erp.total}`}>Order total: {fmtMoney(grandTotal)}</div>
    </ErpFormDialog>
  );
}
