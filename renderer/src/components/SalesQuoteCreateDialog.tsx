import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErpFormDialog } from "@/components/ErpFormDialog";
import { BlindSpotAlertCard } from "@/components/BlindSpotAlertCard";
import { newQuoteLine, QuoteLineItemsEditor } from "@/components/QuoteLineItemsEditor";
import { erp, ErpFieldLabel, fmtMoney } from "@/components/ui-bits";
import { useBlindSpotAlerts } from "@/hooks/useBlindSpotAlerts";
import { getEntities, subscribeCrm } from "@/lib/crm-store";
import { createQuote, type SalesDocStatus } from "@/lib/sales-store";

type QuoteForm = {
  customerCode: string;
  customerName: string;
  terms: string;
  validUntil: string;
  tax: number;
  shipping: number;
  discount: number;
  status: "draft" | "open";
  lines: ReturnType<typeof newQuoteLine>[];
};

function clientOptions() {
  return getEntities().filter((e) => e.kind === "client" || e.kind === "both");
}

function emptyQuoteForm(): QuoteForm {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return {
    customerCode: "",
    customerName: "",
    terms: "Net 30",
    validUntil: d.toISOString().slice(0, 10),
    tax: 0,
    shipping: 0,
    discount: 0,
    status: "open",
    lines: [newQuoteLine()],
  };
}

type SalesQuoteCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function SalesQuoteCreateDialog({ open, onOpenChange, onSaved }: SalesQuoteCreateDialogProps) {
  const [form, setForm] = useState<QuoteForm>(emptyQuoteForm);
  const [, tick] = useState(0);
  const clients = clientOptions();

  useEffect(() => subscribeCrm(() => tick((n) => n + 1)), []);

  useEffect(() => {
    if (open) setForm(emptyQuoteForm());
  }, [open]);

  const merchandise = form.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const grandTotal = merchandise + form.tax + form.shipping - form.discount;
  const selectedClient = clients.find((c) => c.code === form.customerCode);
  const lineSkus = form.lines.map((l) => l.sku.trim()).filter(Boolean);
  const { alerts: blindSpotAlerts, loading: blindSpotLoading } = useBlindSpotAlerts({
    entityId: selectedClient?.id,
    customerCode: form.customerCode || undefined,
    skus: lineSkus,
  });

  function validate(): string | null {
    if (!form.customerCode) return "Select a customer from CRM.";
    if (clients.length === 0) return "Create a client in CRM before creating a quote.";
    if (form.lines.length === 0) return "Add at least one line item.";
    if (form.lines.some((l) => !l.sku.trim())) return "Each line needs a SKU selected from inventory.";
    if (form.lines.some((l) => l.qty <= 0)) return "Quantities must be greater than zero.";
    if (form.lines.some((l) => l.unitPrice < 0)) return "Unit prices cannot be negative.";
    const skus = form.lines.map((l) => l.sku.trim().toUpperCase());
    if (new Set(skus).size !== skus.length) return "Duplicate SKUs are not allowed on one quote.";
    if (!form.validUntil) return "Valid-until date is required.";
    if (form.discount < 0) return "Discount cannot be negative.";
    if (grandTotal < 0) return "Quote total cannot be negative.";
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const status: SalesDocStatus = form.status;
    createQuote({
      customerCode: form.customerCode,
      customerName: form.customerName,
      lines: form.lines.map((l) => ({
        sku: l.sku.trim(),
        description: l.description.trim() || l.sku.trim(),
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
      tax: form.tax,
      shipping: form.shipping,
      discount: form.discount,
      terms: form.terms.trim() || "Net 30",
      status,
      validUntil: form.validUntil,
    });
    onOpenChange(false);
    onSaved?.();
    toast.success("Quote created.");
  }

  function onCustomerSelect(code: string) {
    const c = clients.find((x) => x.code === code);
    setForm({
      ...form,
      customerCode: code,
      customerName: c?.name ?? "",
    });
  }

  const validationError = validate();

  return (
    <ErpFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New sales quote"
      description="Select a CRM customer and inventory SKUs. Adjust quantities, pricing, and discount as needed."
      submitLabel="Create quote"
      onSubmit={handleSave}
      submitDisabled={!!validationError}
      size="xl"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <ErpFieldLabel>Customer (from CRM)</ErpFieldLabel>
          <select
            className={`mt-1 ${erp.input}`}
            value={form.customerCode}
            onChange={(e) => onCustomerSelect(e.target.value)}
          >
            <option value="">Select customer…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          {clients.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No clients in CRM — add a client under CRM → New Entry (role: client).
            </p>
          ) : null}
        </label>
        <label className="block">
          <ErpFieldLabel>Payment terms</ErpFieldLabel>
          <input
            className={`mt-1 ${erp.input}`}
            value={form.terms}
            onChange={(e) => setForm({ ...form, terms: e.target.value })}
            placeholder="Net 30"
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Valid until</ErpFieldLabel>
          <input
            type="date"
            className={`mt-1 ${erp.input}`}
            value={form.validUntil}
            onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Tax</ErpFieldLabel>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`mt-1 ${erp.input} ${erp.financial}`}
            value={form.tax}
            onChange={(e) => setForm({ ...form, tax: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Shipping</ErpFieldLabel>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`mt-1 ${erp.input} ${erp.financial}`}
            value={form.shipping}
            onChange={(e) => setForm({ ...form, shipping: Number(e.target.value) })}
          />
        </label>
        <label className="block">
          <ErpFieldLabel>Discount (override)</ErpFieldLabel>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`mt-1 ${erp.input} ${erp.financial}`}
            value={form.discount}
            onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })}
          />
        </label>
        <label className="block">
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
                checked={form.status === "open"}
                onChange={() => setForm({ ...form, status: "open" })}
              />
              Open
            </label>
          </div>
        </label>
      </div>
      <BlindSpotAlertCard alerts={blindSpotAlerts} loading={blindSpotLoading} />
      <div className="mt-4">
        <QuoteLineItemsEditor lines={form.lines} onChange={(lines) => setForm({ ...form, lines })} />
      </div>
      <div className={`mt-3 text-right text-sm ${erp.total}`}>Quote total: {fmtMoney(grandTotal)}</div>
    </ErpFormDialog>
  );
}
