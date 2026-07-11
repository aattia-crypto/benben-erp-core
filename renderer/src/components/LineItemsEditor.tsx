import { Plus, Trash2 } from "lucide-react";
import { erp, ErpFieldLabel } from "@/components/ui-bits";
import { randomUUID } from "@/lib/uuid";

export type LineItemRow = {
  id: string;
  sku: string;
  description: string;
  qty: number;
  unitCost: number;
  uom?: string;
};

type LineItemsEditorProps = {
  lines: LineItemRow[];
  onChange: (lines: LineItemRow[]) => void;
  showUom?: boolean;
  descriptionLabel?: string;
};

export function newLineItem(partial?: Partial<LineItemRow>): LineItemRow {
  return {
    id: randomUUID(),
    sku: "",
    description: "",
    qty: 1,
    unitCost: 0,
    uom: "ea",
    ...partial,
  };
}

/** Reusable line grid for POs, BOMs, and import receipts. */
export function LineItemsEditor({
  lines,
  onChange,
  showUom,
  descriptionLabel = "Description",
}: LineItemsEditorProps) {
  function patch(id: string, field: keyof LineItemRow, value: string | number) {
    onChange(lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  const lineTotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <ErpFieldLabel>Line items</ErpFieldLabel>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-brand"
          onClick={() => onChange([...lines, newLineItem()])}
        >
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">SKU</th>
              <th className="px-2 py-1.5 text-left">{descriptionLabel}</th>
              {showUom ? <th className="px-2 py-1.5 text-left">UOM</th> : null}
              <th className="px-2 py-1.5 text-right">Qty</th>
              <th className="px-2 py-1.5 text-right">Unit cost</th>
              <th className="px-2 py-1.5 text-right">Ext</th>
              <th className="px-2 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-2 py-1">
                  <input
                    className={erp.input}
                    value={l.sku}
                    onChange={(e) => patch(l.id, "sku", e.target.value)}
                    placeholder="SKU"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    className={erp.input}
                    value={l.description}
                    onChange={(e) => patch(l.id, "description", e.target.value)}
                  />
                </td>
                {showUom ? (
                  <td className="px-2 py-1">
                    <input
                      className={`${erp.input} w-16`}
                      value={l.uom ?? "ea"}
                      onChange={(e) => patch(l.id, "uom", e.target.value)}
                    />
                  </td>
                ) : null}
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={`${erp.input} text-right`}
                    value={l.qty}
                    onChange={(e) => patch(l.id, "qty", Number(e.target.value))}
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={`${erp.input} text-right ${erp.financial}`}
                    value={l.unitCost}
                    onChange={(e) => patch(l.id, "unitCost", Number(e.target.value))}
                  />
                </td>
                <td className={`px-2 py-1 text-right ${erp.financial}`}>
                  {(l.qty * l.unitCost).toFixed(2)}
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
        Subtotal: ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}
