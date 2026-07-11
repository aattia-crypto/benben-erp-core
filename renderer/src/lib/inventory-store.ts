import { publishErpChange } from "./erp-sync";
import {
  DEMO_INVENTORY_ITEMS,
  DEMO_INVENTORY_MOVEMENTS,
  shouldUseDemoFallback,
} from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import { isInventoryBackend } from "./inventory-bridge";
import * as inventoryBridge from "./inventory-bridge";
import { persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type InventoryItem = {
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

export type InventoryMovement = {
  id: string;
  sku: string;
  type: "receive" | "issue" | "adjust" | "transfer";
  qty: number;
  reason: string;
  at: string;
  warehouse: string;
};

export type ItemInput = Omit<InventoryItem, "id">;

type Store = { items: InventoryItem[]; movements: InventoryMovement[] };

const listeners = new Set<() => void>();

let cache: Store = { items: [], movements: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emptyStore(): Store {
  return { items: [], movements: [] };
}

function emitInventoryChange(): void {
  listeners.forEach((fn) => fn());
  publishErpChange("inventory", "updated");
}

function applyCache(next: Store): void {
  cache = next;
  emitInventoryChange();
}

function persistInventory(
  task: () => Promise<void>,
  rollback: () => void,
): void {
  persistInBackground("inventory-store", task, rollback, emitInventoryChange);
}

export function invalidateInventoryHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export function resetInventoryStore(): void {
  cache = emptyStore();
  hydrated = false;
  hydratePromise = null;
  emitInventoryChange();
}

export function subscribeInventory(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function seedInventoryFromDemo(): void {
  cache = {
    items: DEMO_INVENTORY_ITEMS.map((i) => ({ ...i })),
    movements: DEMO_INVENTORY_MOVEMENTS.map((m) => ({ ...m })),
  };
}

/** Presenter Mode: fill cache immediately (no IPC). */
export function applyDemoFallbackSeed(): void {
  if (!isDemoBuild()) return;
  seedInventoryFromDemo();
  hydrated = true;
  emitInventoryChange();
}

export async function hydrateInventoryStore(): Promise<void> {
  if (isDemoBuild()) {
    applyDemoFallbackSeed();
  }
  if (!isInventoryBackend()) return;
  if (!isDemoBuild() && hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const [items, movements] = await Promise.all([
          inventoryBridge.fetchInventoryItems(),
          inventoryBridge.fetchInventoryMovements(),
        ]);
        if (isDemoBuild()) {
          if (items.length > 0) {
            cache = { items, movements };
            emitInventoryChange();
          }
          return;
        }
        cache = { items, movements };
        hydrated = true;
        emitInventoryChange();
      } catch (err) {
        if (isDemoBuild()) {
          applyDemoFallbackSeed();
          return;
        }
        hydratePromise = null;
        throw err;
      }
    })();
  }
  await hydratePromise;
}

function ensureHydrationKickoff(): void {
  if (!isInventoryBackend() || hydrated || hydratePromise) return;
  void hydrateInventoryStore();
}

export function getInventoryItems(): InventoryItem[] {
  ensureHydrationKickoff();
  if (shouldUseDemoFallback() && cache.items.length === 0) {
    applyDemoFallbackSeed();
  }
  return cache.items.length > 0 ? cache.items : shouldUseDemoFallback() ? DEMO_INVENTORY_ITEMS : cache.items;
}

export function getMovements(sku?: string): InventoryMovement[] {
  ensureHydrationKickoff();
  const movements =
    shouldUseDemoFallback() && cache.movements.length === 0
      ? DEMO_INVENTORY_MOVEMENTS
      : cache.movements;
  return sku ? movements.filter((m) => m.sku === sku) : movements;
}

export function findBySkuOrBarcode(code: string): InventoryItem | undefined {
  const q = code.trim().toUpperCase();
  return cache.items.find(
    (i) =>
      i.sku.toUpperCase() === q ||
      i.barcode?.toUpperCase() === q ||
      i.qrCode?.toUpperCase() === q ||
      i.barcode?.toUpperCase() === `BC-${q}` ||
      i.qrCode?.toUpperCase() === `QR-${q}`,
  );
}

export function createItem(input: ItemInput): InventoryItem {
  const optimistic: InventoryItem = { ...input, id: uid("inv") };
  const previous = cache;
  applyCache({ ...cache, items: [optimistic, ...cache.items] });

  if (!isInventoryBackend()) return optimistic;

  persistInventory(
    async () => {
      const saved = await inventoryBridge.createInventoryItemRemote(input);
      applyCache({
        ...cache,
        items: [saved, ...cache.items.filter((i) => i.id !== optimistic.id)],
      });
    },
    () => {
      cache = previous;
    },
  );

  return optimistic;
}

export function updateItem(id: string, patch: Partial<ItemInput>): InventoryItem | null {
  let updated: InventoryItem | null = null;
  const items = cache.items.map((i) => {
    if (i.id !== id) return i;
    updated = { ...i, ...patch };
    return updated;
  });
  if (!updated) return null;

  const previous = cache;
  applyCache({ ...cache, items });

  if (!isInventoryBackend()) return updated;

  persistInventory(
    async () => {
      const saved = await inventoryBridge.updateInventoryItemRemote(id, patch);
      applyCache({
        ...cache,
        items: cache.items.map((i) => (i.id === id ? saved : i)),
      });
    },
    () => {
      cache = previous;
    },
  );

  return updated;
}

export function deleteItem(id: string): boolean {
  const items = cache.items.filter((i) => i.id !== id);
  if (items.length === cache.items.length) return false;

  const previous = cache;
  applyCache({ ...cache, items });

  if (!isInventoryBackend()) return true;

  persistInventory(
    async () => {
      const deleted = await inventoryBridge.deleteInventoryItemRemote(id);
      if (!deleted) {
        cache = previous;
        emitInventoryChange();
      }
    },
    () => {
      cache = previous;
    },
  );

  return true;
}

export function adjustStock(
  sku: string,
  qty: number,
  type: InventoryMovement["type"],
  reason: string,
): void {
  const previous = cache;
  const items = cache.items.map((i) =>
    i.sku === sku ? { ...i, onHand: Math.max(0, i.onHand + (type === "issue" ? -qty : qty)) } : i,
  );
  const movement: InventoryMovement = {
    id: uid("mv"),
    sku,
    type,
    qty,
    reason,
    at: new Date().toISOString(),
    warehouse: items.find((i) => i.sku === sku)?.warehouse ?? "Main",
  };
  applyCache({ ...cache, items, movements: [movement, ...cache.movements] });

  if (!isInventoryBackend()) return;

  persistInventory(
    async () => {
      const result = await inventoryBridge.adjustInventoryStockRemote(sku, qty, type, reason);
      const nextItems = result.item
        ? cache.items.map((i) => (i.sku === sku ? result.item! : i))
        : cache.items;
      const nextMovements = [
        result.movement,
        ...cache.movements.filter((m) => m.id !== movement.id),
      ];
      applyCache({ items: nextItems, movements: nextMovements });
    },
    () => {
      cache = previous;
    },
  );
}

export function stockValuation(): number {
  return cache.items.reduce((s, i) => s + i.onHand * i.unitCost, 0);
}

/**
 * Update unit cost using weighted average when import landed cost is allocated.
 * newUnitCost = (onHand × oldCost + qty × landedUnit) / (onHand + qty) — uses onHand as weight proxy.
 */
export function applyWeightedUnitCosts(
  allocations: { sku: string; landedUnitCost: number }[],
  reason: string,
): void {
  const previous = cache;
  const items = cache.items.map((item) => {
    const alloc = allocations.find((a) => a.sku === item.sku);
    if (!alloc) return item;
    const weightQty = Math.max(item.onHand, 1);
    const newCost =
      Math.round(
        ((item.onHand * item.unitCost + weightQty * alloc.landedUnitCost) /
          (item.onHand + weightQty)) *
          100,
      ) / 100;
    return { ...item, unitCost: newCost };
  });
  const movements = allocations.map((a) => ({
    id: uid("mv"),
    sku: a.sku,
    type: "adjust" as const,
    qty: 0,
    reason: `${reason} → $${a.landedUnitCost}/unit`,
    at: new Date().toISOString(),
    warehouse: items.find((i) => i.sku === a.sku)?.warehouse ?? "Main",
  }));
  applyCache({ ...cache, items, movements: [...movements, ...cache.movements] });

  if (!isInventoryBackend()) return;

  persistInventory(
    async () => {
      const savedItems = await inventoryBridge.applyWeightedUnitCostsRemote(allocations, reason);
      const savedBySku = new Map(savedItems.map((i) => [i.sku, i]));
      const nextItems = cache.items.map((i) => savedBySku.get(i.sku) ?? i);
      applyCache({ ...cache, items: nextItems });
    },
    () => {
      cache = previous;
    },
  );
}
