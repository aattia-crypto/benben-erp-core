import { importEntityRecord, getEntities } from "../crm-store";
import { importAccount, getAccounts } from "../gl-store";
import { createItem, getInventoryItems } from "../inventory-store";
import type { FieldMapping, ImportEntityType, ImportPreview, ImportRow, ImportValidationIssue } from "./types";
import { targetFieldsFor } from "./templates";
import { appendImportHistory } from "./history";
import type { Account, EntityKind } from "../mock-data";

function autoMap(headers: string[], entity: ImportEntityType): FieldMapping[] {
  const targets = targetFieldsFor(entity);
  return targets.map((targetField) => {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "_");
    const hit =
      headers.find((h) => norm(h) === targetField) ??
      headers.find((h) => norm(h).includes(targetField.replace(/_/g, "")));
    return { targetField, sourceColumn: hit ?? "" };
  });
}

function mapRow(row: ImportRow, mapping: FieldMapping[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of mapping) {
    if (!m.sourceColumn) continue;
    out[m.targetField] = String(row[m.sourceColumn] ?? "").trim();
  }
  return out;
}

export function buildPreview(
  entity: ImportEntityType,
  headers: string[],
  rows: ImportRow[],
  mapping?: FieldMapping[],
): ImportPreview {
  const map = mapping ?? autoMap(headers, entity);
  const issues: ImportValidationIssue[] = [];
  let duplicateCount = 0;

  const existingSkus = new Set(getInventoryItems().map((i) => i.sku.toUpperCase()));
  const existingCodes = new Set(getEntities().map((e) => e.code.toUpperCase()));
  const existingAccounts = new Set(getAccounts().map((a) => a.code));

  rows.forEach((row, idx) => {
    const m = mapRow(row, map);
    if (entity === "products" || entity === "beginning_inventory") {
      if (!m.sku) issues.push({ row: idx + 2, field: "sku", message: "SKU required", severity: "error" });
      else if (existingSkus.has(m.sku.toUpperCase())) {
        duplicateCount++;
        issues.push({ row: idx + 2, field: "sku", message: `Duplicate SKU ${m.sku}`, severity: "warning" });
      }
    }
    if (entity === "customers" || entity === "vendors") {
      if (!m.code) issues.push({ row: idx + 2, field: "code", message: "Code required", severity: "error" });
      else if (existingCodes.has(m.code.toUpperCase())) {
        duplicateCount++;
        issues.push({ row: idx + 2, message: `Duplicate code ${m.code}`, severity: "warning" });
      }
      if (!m.name) issues.push({ row: idx + 2, field: "name", message: "Name required", severity: "error" });
    }
    if (entity === "chart_of_accounts") {
      if (!m.account_code) {
        issues.push({ row: idx + 2, field: "account_code", message: "Account code required", severity: "error" });
      } else if (existingAccounts.has(m.account_code)) {
        duplicateCount++;
        issues.push({ row: idx + 2, message: `Duplicate account ${m.account_code}`, severity: "warning" });
      }
    }
  });

  return { entity, headers, rows, mapping: map, issues, duplicateCount };
}

export function commitImport(
  preview: ImportPreview,
  fileName: string,
  options?: { skipDuplicates?: boolean },
): { success: number; errors: number } {
  let success = 0;
  let errors = 0;
  const skipDup = options?.skipDuplicates ?? true;

  for (let i = 0; i < preview.rows.length; i++) {
    const row = preview.rows[i];
    const m = mapRow(row, preview.mapping);
    const rowNum = i + 2;
    const hasError = preview.issues.some((x) => x.row === rowNum && x.severity === "error");
    const isDup = preview.issues.some((x) => x.row === rowNum && x.message.includes("Duplicate"));
    if (hasError || (isDup && skipDup)) {
      if (hasError) errors++;
      continue;
    }
    try {
      if (preview.entity === "products") {
        createItem({
          sku: m.sku,
          name: m.name || m.sku,
          category: m.category || "General",
          uom: m.uom || "ea",
          onHand: 0,
          reorderLevel: 10,
          unitCost: Number(m.unit_cost) || 0,
          warehouse: "WH-MAIN",
          location: "—",
          barcode: m.barcode || undefined,
          qrCode: m.qr_code || undefined,
          status: "active",
        });
      } else if (preview.entity === "beginning_inventory") {
        createItem({
          sku: m.sku,
          name: m.name || m.sku,
          category: "Components",
          uom: "ea",
          onHand: Number(m.qty) || 0,
          reorderLevel: 10,
          unitCost: Number(m.unit_cost) || 0,
          warehouse: m.warehouse || "WH-MAIN",
          location: m.location || "A1",
          barcode: m.barcode || undefined,
          qrCode: m.qr_code || undefined,
          status: "active",
        });
      } else if (preview.entity === "customers") {
        importEntityRecord({
          code: m.code,
          name: m.name,
          kind: "client" as EntityKind,
          contact: m.email || m.phone,
          country: "USA",
        });
      } else if (preview.entity === "vendors") {
        importEntityRecord({
          code: m.code,
          name: m.name,
          kind: "vendor",
          contact: m.email || m.phone,
          country: "USA",
        });
      } else if (preview.entity === "chart_of_accounts") {
        importAccount({
          code: m.account_code,
          name: m.name || m.account_code,
          type: (m.type as Account["type"]) || "asset",
        });
      }
      success++;
    } catch {
      errors++;
    }
  }

  appendImportHistory({
    entity: preview.entity,
    fileName,
    rowCount: preview.rows.length,
    successCount: success,
    errorCount: errors,
    status: errors === 0 ? "completed" : success > 0 ? "partial" : "failed",
  });

  return { success, errors };
}
