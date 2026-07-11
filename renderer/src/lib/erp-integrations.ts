/**
 * Cross-module ERP integration orchestration.
 * Financial writes use postJournalBridge / AR·AP bridges (local PostgreSQL-first).
 */

import { publishErpChange } from "./erp-sync";
import { createArInvoiceBridge } from "./ar-bridge";
import { createApBillBridge } from "./ap-bridge";
import { postJournalBridge } from "./gl-bridge";
import type { DraftJournalLine } from "./gl-store";
import { adjustStock, findBySkuOrBarcode } from "./inventory-store";
import { addActivity, getEntities } from "./crm-store";
import type { PosSale } from "./pos-store";
import type { PurchaseOrder } from "./purchasing-store";
import { poGrandTotal } from "./purchasing-store";
import type { SalesInvoice } from "./sales-store";

function crmNote(customerCode: string, subject: string, body: string): void {
  const entity = getEntities().find((e) => e.code === customerCode);
  if (entity) addActivity(entity.id, "note", subject, body);
}

/** POS on-account → AR invoice (includes GL) via database bridge. */
export async function integratePosArSale(
  sale: PosSale,
  customerCode: string,
  customerName: string,
): Promise<void> {
  await createArInvoiceBridge({
    customerCode,
    customerName,
    lines: sale.lines.map((l) => ({
      sku: l.sku,
      description: l.name,
      qty: l.qty,
      unitPrice: l.price,
    })),
    subtotal: sale.subtotal,
    tax: sale.tax,
    shipping: 0,
    discount: 0,
    terms: "Net 30",
    issuedAt: sale.date.slice(0, 10),
    dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    source: "pos",
    sourceRef: sale.ref,
    idempotencyKey: `pos-ar-${sale.ref}`,
  });
  crmNote(customerCode, `POS on-account ${sale.ref}`, `Charged $${sale.total.toFixed(2)} at ${sale.locationId}`);
  publishErpChange("crm", "financial-activity");
}

/** Fulfill sales invoice: inventory issue, AR (with GL), CRM. */
export async function integrateSalesInvoiceFulfillment(invoice: SalesInvoice): Promise<void> {
  for (const line of invoice.lines) {
    adjustStock(line.sku, line.qty, "issue", `Sales invoice ${invoice.invoiceNumber}`);
  }
  await createArInvoiceBridge({
    customerCode: invoice.customerCode,
    customerName: invoice.customerName,
    lines: invoice.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    shipping: invoice.shipping,
    discount: invoice.discount,
    terms: invoice.terms,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    source: "sales",
    sourceRef: invoice.invoiceNumber,
    idempotencyKey: `sales-inv-${invoice.invoiceNumber}`,
  });
  crmNote(
    invoice.customerCode,
    `Invoice ${invoice.invoiceNumber}`,
    `Total $${invoice.total.toFixed(2)} · due ${invoice.dueAt}`,
  );
  publishErpChange("inventory", "sales-issue");
  publishErpChange("ar", "invoice-created");
}

/** PO receive → vendor bill (includes GL) via database bridge. */
export async function integratePoToApBill(po: PurchaseOrder): Promise<void> {
  const total = poGrandTotal(po);
  await createApBillBridge({
    vendorCode: po.vendorCode,
    vendorName: po.vendorName,
    poId: po.id,
    lines: po.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitCost: l.unitCost,
      expenseAccount: "5000",
    })),
    subtotal: po.lines.reduce((s, l) => s + l.qty * l.unitCost, 0),
    tax: po.taxAmount,
    total,
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: po.expectedDelivery,
    idempotencyKey: `po-ap-${po.poNumber}`,
  });
  publishErpChange("ap", "bill-from-po");
}

/** Standalone GL post for integrations that only need journal lines. */
export async function integrateGlPost(
  module: string,
  memo: string,
  lines: DraftJournalLine[],
  options?: { source?: "manual" | "sales" | "ap"; reference?: string; idempotencyKey?: string },
): Promise<void> {
  await postJournalBridge(memo, lines, options?.source ?? "manual", {
    module,
    reference: options?.reference,
    idempotencyKey: options?.idempotencyKey,
  });
}

export function syncInventoryLookupToPos(barcode: string): string | undefined {
  const item = findBySkuOrBarcode(barcode);
  return item?.sku;
}
