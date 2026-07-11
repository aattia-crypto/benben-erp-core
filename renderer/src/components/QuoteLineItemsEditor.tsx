import { Plus, Trash2 } from "lucide-react";
import { erp, ErpFieldLabel } from "@/components/ui-bits";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { randomUUID } from "@/lib/uuid";

export type QuoteLineRow = {
  id: string;
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
  uom?: string;
};

export function newQuoteLine(partial?: Partial<QuoteLineRow>): QuoteLineRow {
  return {
    id: randomUUID(),
    sku: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    uom: "ea",
    ...partial,
  };
}

function catalogUnitPrice(unitCost: number): number {
  return Math.round(unitCost * 1.35 * 100) / 100;
}

type QuoteLineItemsEditorProps = {
  lines: QuoteLineRow[];
  onChange: (lines: QuoteLineRow[]) => void;
};

/** Quote line grid — SKU from inventory; description/UOM auto-filled; qty and unit price editable. */
export function QuoteLineItemsEditor({ lines, onChange }: QuoteLineItemsEditorProps) {
  const { items } = useProductCatalog();
  const activeItems = items.filter((i) => i.status === "active");

  function patchLine(id: string, updates: Partial<QuoteLineRow>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }

  function onSkuSelect(lineId: string, sku: string) {
    const item = activeItems.find((i) => i.sku === sku);
    if (!item) {
      patchLine(lineId, { sku: "", description: "", uom: "ea", unitPrice: 0 });
      return;
    }
    patchLine(lineId, {
      sku: item.sku,
      description: item.name,
      uom: item.uom,
      unitPrice: catalogUnitPrice(item.unitCost),
    });
  }

  const lineTotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <ErpFieldLabel>Line items</ErpFieldLabel>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-brand"
          onClick={() => onChange([...lines, newQuoteLine()])}
          disabled={activeItems.length === 0}
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      </div>

      {activeItems.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          Add inventory items first (Inventory module) before quoting SKUs.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">SKU</th>
              <th className="px-2 py-1.5 text-left">Description</th>
              <th className="px-2 py-1.5 text-left">UOM</th>
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-right">Unit price</th>
              <th className="px-2 py-1.5 text-right">Ext</th>
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-2 py-1">
                  <select
                    className={erp.input}
                    value={l.sku}
                    onChange={(e) => onSkuSelect(l.id, e.target.value)}
                  >
                    <option value="">Select SKU…</option>
                    {activeItems.map((item) => (
                      <option key={item.id} value={item.sku}>
                        {item.sku} — {item.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    className={`${erp.input} bg-erp-readonly`}
                    value={l.description}
                    readOnly
                    tabIndex={-1}
                    placeholder="—"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    className={`${erp.input} w-16 bg-erp-readonly`}
                    value={l.uom ?? "ea"}
                    readOnly
                    tabIndex={-1}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={`${erp.input} text-right`}
                    value={l.qty}
                    onChange={(e) => patchLine(l.id, { qty: Number(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={`${erp.input} text-right ${erp.financial}`}
                    value={l.unitPrice}
                    onChange={(e) => patchLine(l.id, { unitPrice: Number(e.target.value) })}
                  />
                </td>
                <td className={`px-2 py-1 text-right ${erp.financial}`}>
                  {(l.qty * l.unitPrice).toFixed(2)}
                </td>
                <td className="px-2 py-1 text-center">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-danger"
                    disabled={lines.length <= 1}
                    onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`text-right text-sm ${erp.financial}`}>
        Merchandise: ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}
