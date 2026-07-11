/**
 * Rich demo dataset for workspace onboarding (localStorage modules).
 * Called after demo keys are cleared on restore — stores also self-seed on first read.
 */

import { isDemoMode } from "./demo-mode";
import { uid, writeStorage } from "./storage";

/** Demo attachment metadata (files are labels only in desktop demo). */
export const DEMO_DOCUMENTS = {
  vendorInvoice: "demo-vendor-invoice-Wafertek-042.pdf",
  scannedInvoice: "demo-scanned-invoice-scan-2026-05.png",
  purchaseOrder: "demo-purchase-order-PO-2026-0042.pdf",
  customsEntry: "commercial-invoice-IMP-018.pdf",
  warehouseTransfer: "demo-transfer-WH-MAIN-to-S1.pdf",
} as const;

export function seedDemoWorkspaceMetadata(): void {
  if (!isDemoMode()) return;
  writeStorage("benben.demo.documents.v1", {
    ...DEMO_DOCUMENTS,
    barcodeLabels: ["QR-RM-SUB-01", "QR-SF-A7-W", "BC-0194250000012"],
    seededAt: new Date().toISOString(),
  });
}

/** Ensures transfer / BOM / PO demo references exist in purchasing & manufacturing keys. */
export function enrichDemoModuleNotes(): void {
  if (!isDemoMode()) return;
  writeStorage("benben.demo.warehouse_transfers.v1", [
    {
      id: uid("xfr"),
      from: "WH-MAIN",
      to: "S1",
      sku: "SF-A7-W",
      qty: 24,
      ref: "XFR-2026-0112",
      document: DEMO_DOCUMENTS.warehouseTransfer,
    },
  ]);
}
