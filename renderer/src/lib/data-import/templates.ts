import * as XLSX from "xlsx";
import type { ImportEntityType } from "./types";

const TEMPLATE_COLUMNS: Record<ImportEntityType, string[]> = {
  customers: ["code", "name", "email", "phone", "address", "terms"],
  vendors: ["code", "name", "email", "phone", "address", "payment_terms"],
  products: ["sku", "name", "category", "uom", "unit_cost", "barcode", "qr_code"],
  chart_of_accounts: ["account_code", "name", "type", "parent"],
  beginning_inventory: ["sku", "warehouse", "location", "qty", "unit_cost"],
};

export function downloadImportTemplate(entity: ImportEntityType): void {
  const headers = TEMPLATE_COLUMNS[entity];
  const sample: Record<string, string>[] = [];
  if (entity === "customers") {
    sample.push({
      code: "C-1001",
      name: "Acme Semiconductor",
      email: "ap@acme.example",
      phone: "408-555-0100",
      address: "1 Fab Way, San Jose CA",
      terms: "Net 30",
    });
  } else if (entity === "vendors") {
    sample.push({
      code: "V-2210",
      name: "Wafertek Materials",
      email: "orders@wafertek.example",
      phone: "512-555-0200",
      address: "Austin TX",
      payment_terms: "Net 45",
    });
  } else if (entity === "products") {
    sample.push({
      sku: "RM-SUB-01",
      name: "Silicon Substrate 300mm",
      category: "Components",
      uom: "ea",
      unit_cost: "420",
      barcode: "0194250000999",
      qr_code: "QR-RM-SUB-01",
    });
  } else if (entity === "chart_of_accounts") {
    sample.push({ account_code: "1200", name: "Inventory", type: "asset", parent: "1000" });
  } else {
    sample.push({
      sku: "RM-SUB-01",
      warehouse: "WH-MAIN",
      location: "A1",
      qty: "100",
      unit_cost: "420",
    });
  }
  const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entity);
  XLSX.writeFile(wb, `benben-import-${entity}-template.xlsx`);
}

export function targetFieldsFor(entity: ImportEntityType): string[] {
  return TEMPLATE_COLUMNS[entity];
}
