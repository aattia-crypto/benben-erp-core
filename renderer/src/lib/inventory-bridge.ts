/**
 * Desktop IPC bridge for inventory operations (window.benben.operations.inventory).
 */
import { isDesktopShell } from "./desktop-api";
import type { InventoryItem, InventoryMovement, ItemInput } from "./inventory-store";

type IpcOk<T> = { ok: true; data: T };
type IpcErr = { ok: false; error: string };

function inventoryApi() {
  const api = window.benben?.operations?.inventory;
  if (!api) throw new Error("Inventory module requires the Benben desktop app.");
  return api;
}

function unwrap<T>(res: IpcOk<T> | IpcErr): T {
  if (!res.ok) throw new Error(res.error || "Request failed.");
  return res.data;
}

export function isInventoryBackend(): boolean {
  return isDesktopShell() && !!window.benben?.operations?.inventory;
}

export async function fetchInventoryItems(): Promise<InventoryItem[]> {
  return unwrap(await inventoryApi().list());
}

export async function fetchInventoryMovements(sku?: string): Promise<InventoryMovement[]> {
  return unwrap(await inventoryApi().listMovements(sku));
}

export async function fetchInventoryItemByScan(code: string): Promise<InventoryItem | null> {
  return unwrap(await inventoryApi().findByScan(code));
}

export async function createInventoryItemRemote(input: ItemInput): Promise<InventoryItem> {
  return unwrap(await inventoryApi().create(input));
}

export async function updateInventoryItemRemote(
  id: string,
  patch: Partial<ItemInput>,
): Promise<InventoryItem> {
  return unwrap(await inventoryApi().update(id, patch));
}

export async function deleteInventoryItemRemote(id: string): Promise<boolean> {
  const res = unwrap(await inventoryApi().delete(id));
  return res.deleted;
}

export async function adjustInventoryStockRemote(
  sku: string,
  qty: number,
  type: InventoryMovement["type"],
  reason: string,
): Promise<{ item: InventoryItem | null; movement: InventoryMovement }> {
  return unwrap(await inventoryApi().adjustStock({ sku, qty, type, reason }));
}

export async function applyWeightedUnitCostsRemote(
  allocations: { sku: string; landedUnitCost: number }[],
  reason: string,
): Promise<InventoryItem[]> {
  return unwrap(await inventoryApi().applyWeightedCosts(allocations, reason));
}

export async function fetchStockValuationRemote(): Promise<number> {
  const res = unwrap(await inventoryApi().valuation());
  return res.total;
}
