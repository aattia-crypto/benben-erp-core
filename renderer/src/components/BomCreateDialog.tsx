import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErpFormDialog } from "@/components/ErpFormDialog";
import { BomLineItemsEditor } from "@/components/BomLineItemsEditor";
import { newLineItem } from "@/components/LineItemsEditor";
import { erp, ErpFieldLabel } from "@/components/ui-bits";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { saveBom, type BomLine } from "@/lib/manufacturing-store";

type BomCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

const emptyForm = () => ({
  bomCode: "",
  name: "",
  productSku: "",
  notes: "",
  lines: [newLineItem()] as ReturnType<typeof newLineItem>[],
});

export function BomCreateDialog({ open, onOpenChange, onSaved }: BomCreateDialogProps) {
  const [form, setForm] = useState(emptyForm);
  const { items } = useProductCatalog();
  const activeItems = items.filter((i) => i.status === "active");

  useEffect(() => {
    if (open) setForm(emptyForm());
  }, [open]);

  function onFinishedGoodSelect(sku: string) {
    const item = activeItems.find((i) => i.sku === sku);
    if (!item) {
      setForm((f) => ({ ...f, productSku: "", name: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      productSku: item.sku,
      name: item.name,
      bomCode: f.bomCode.trim() ? f.bomCode : `BOM-${item.sku}`,
    }));
  }

  function validate(): string | null {
    if (!form.bomCode.trim()) return "BOM code is required.";
    if (!form.productSku.trim()) return "Select a finished good from inventory.";
    if (!form.name.trim()) return "Finished good name is required.";
    if (form.lines.length === 0) return "Add at least one component line.";
    if (form.lines.some((l) => !l.sku.trim())) return "Each line needs a component SKU selected.";
    if (form.lines.some((l) => l.qty <= 0)) return "Quantities must be greater than zero.";
    if (form.lines.some((l) => l.unitCost < 0)) return "Unit costs cannot be negative.";
    const skus = form.lines.map((l) => l.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) return "Duplicate component SKUs are not allowed.";
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const lines: BomLine[] = form.lines.map((l) => ({
      id: l.id,
      sku: l.sku.trim(),
      material: l.description.trim() || l.sku.trim(),
      qtyPerUnit: l.qty,
      uom: l.uom ?? "ea",
      unitCost: l.unitCost,
    }));
    saveBom({
      bomCode: form.bomCode.trim().toUpperCase(),
      name: form.name.trim(),
      version: "1.0",
      productSku: form.productSku.trim().toUpperCase(),
      effectiveFrom: new Date().toISOString().slice(0, 10),
      lines,
      notes: form.notes.trim() || undefined,
    });
    onOpenChange(false);
    onSaved?.();
  }

  const err = validate();

  return (
    <ErpFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New bill of materials"
      description="Pick finished goods and components from inventory. Nothing is saved until you confirm."
      submitLabel="Create BOM"
      onSubmit={handleSave}
      submitDisabled={!!err}
      size="xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Finished good (from inventory)</ErpFieldLabel>
          <select
            className={`mt-1 ${erp.input}`}
            value={form.productSku}
            onChange={(e) => onFinishedGoodSelect(e.target.value)}
          >
            <option value="">Select finished good SKU…</option>
            {activeItems.map((item) => (
              <option key={item.id} value={item.sku}>
                {item.sku} — {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <ErpFieldLabel>BOM code</ErpFieldLabel>
          <input
            className={`mt-1 ${erp.input}`}
            value={form.bomCode}
            onChange={(e) => setForm({ ...form, bomCode: e.target.value })}
            placeholder="BOM-SF-A7"
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Finished good name</ErpFieldLabel>
          <input
            className={`mt-1 ${erp.input} bg-erp-readonly`}
            value={form.name}
            readOnly
            tabIndex={-1}
          />
        </label>
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Notes</ErpFieldLabel>
          <textarea
            className={`mt-1 ${erp.input} min-h-[60px]`}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-4">
        <BomLineItemsEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} />
      </div>
    </ErpFormDialog>
  );
}
