import type { InventoryItem, InventoryMovement, StockLocation } from "@prisma/client";

export const DEFAULT_ORG_ID = "default";

export type InventoryItemDto = {
  id: string;
  sku: string;
  name: string;
  category: string;
  uom: string;
  onHand: number;
  reorderLevel: number;
  unitCost: number;
  warehouse: string;
  location: string;
  barcode?: string;
  qrCode?: string;
  status: "active" | "discontinued";
};

export type InventoryMovementDto = {
  id: string;
  sku: string;
  type: "receive" | "issue" | "adjust" | "transfer";
  qty: number;
  reason: string;
  at: string;
  warehouse: string;
};

export type StockLocationDto = {
  id: string;
  label: string;
  kind: "store" | "warehouse";
  taxState?: string;
  address?: string;
  phone?: string;
  warehouseId?: string;
  registers?: string[];
  managerName?: string;
  active: boolean;
};

export type ItemInputDto = Omit<InventoryItemDto, "id">;

export type LocationInputDto = Omit<StockLocationDto, "id" | "active">;

export type AdjustStockInput = {
  sku: string;
  qty: number;
  type: InventoryMovementDto["type"];
  reason: string;
};

export type WeightedCostAllocation = {
  sku: string;
  landedUnitCost: number;
};

export function toInventoryItemDto(row: InventoryItem): InventoryItemDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    uom: row.uom,
    onHand: row.onHand,
    reorderLevel: row.reorderLevel,
    unitCost: row.unitCost,
    warehouse: row.warehouse,
    location: row.binLocation,
    barcode: row.barcode ?? undefined,
    qrCode: row.qrCode ?? undefined,
    status: row.status === "discontinued" ? "discontinued" : "active",
  };
}

export function toInventoryMovementDto(row: InventoryMovement): InventoryMovementDto {
  return {
    id: row.id,
    sku: row.sku,
    type: row.type as InventoryMovementDto["type"],
    qty: row.qty,
    reason: row.reason,
    at: row.occurredAt.toISOString(),
    warehouse: row.warehouse,
  };
}

export function parseRegisters(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function encodeRegisters(registers?: string[]): string | null {
  if (!registers?.length) return null;
  return JSON.stringify(registers);
}

export function toStockLocationDto(row: StockLocation): StockLocationDto {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind as StockLocationDto["kind"],
    taxState: row.taxState ?? undefined,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    warehouseId: row.warehouseId ?? undefined,
    registers: parseRegisters(row.registers),
    managerName: row.managerName ?? undefined,
    active: row.isActive,
  };
}
