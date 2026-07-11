/**
 * Stores, warehouses, registers — used by POS, purchasing, and inventory.
 * Production workspaces start empty until configured in Settings → Locations.
 */

import { publishErpChange } from "./erp-sync";
import { DEMO_LOCATIONS, DEMO_WAREHOUSE_HUBS, shouldUseDemoFallback } from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import { isLocationBackend } from "./location-bridge";
import * as locationBridge from "./location-bridge";

export type LocationKind = "store" | "warehouse";

export type StockLocation = {
  id: string;
  label: string;
  kind: LocationKind;
  taxState?: string;
  address?: string;
  phone?: string;
  /** Linked warehouse for retail stores (receiving / stock). */
  warehouseId?: string;
  /** Register terminals at this site. */
  registers?: string[];
  managerName?: string;
  active: boolean;
};

export type LocationInput = Omit<StockLocation, "id" | "active">;

const listeners = new Set<() => void>();

let cache: StockLocation[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function normalize(loc: StockLocation): StockLocation {
  return {
    ...loc,
    registers: loc.registers ?? [],
    active: loc.active !== false,
  };
}

function emitLocationChange(): void {
  listeners.forEach((fn) => fn());
  publishErpChange("pos", "locations-updated");
}

function applyCache(next: StockLocation[]): void {
  cache = next.map(normalize);
  emitLocationChange();
}

function persistInBackground(task: () => Promise<void>, rollback: () => void): void {
  void task().catch((err) => {
    console.error("[location-store] persistence failed:", err);
    rollback();
    emitLocationChange();
  });
}

export function resetLocationStore(): void {
  cache = [];
  hydrated = false;
  hydratePromise = null;
  publishErpChange("pos", "locations-reset");
  emitLocationChange();
}

export function subscribeLocations(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateLocationHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

/** Presenter Mode: fill cache immediately (no IPC). */
export function applyDemoFallbackSeed(): void {
  if (!isDemoBuild()) return;
  cache = DEMO_LOCATIONS.map(normalize);
  hydrated = true;
  emitLocationChange();
}

export async function hydrateLocationStore(): Promise<void> {
  if (isDemoBuild()) {
    applyDemoFallbackSeed();
  }
  if (!isLocationBackend()) return;
  if (!isDemoBuild() && hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const rows = (await locationBridge.fetchLocations(true)).map(normalize);
        if (isDemoBuild()) {
          if (rows.length > 0) {
            cache = rows;
            emitLocationChange();
          }
          return;
        }
        cache = rows;
        hydrated = true;
        emitLocationChange();
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
  if (!isLocationBackend() || hydrated || hydratePromise) return;
  void hydrateLocationStore();
}

export function getAllLocations(includeArchived = false): StockLocation[] {
  ensureHydrationKickoff();
  if (shouldUseDemoFallback() && cache.length === 0) {
    applyDemoFallbackSeed();
  }
  const rows =
    shouldUseDemoFallback() && cache.length === 0
      ? DEMO_LOCATIONS.map(normalize)
      : cache;
  return includeArchived ? rows : rows.filter((l) => l.active);
}

export function getLocations(): StockLocation[] {
  return getAllLocations(false);
}

export function getStores(): StockLocation[] {
  return getLocations().filter((l) => l.kind === "store");
}

export function getWarehouses(): StockLocation[] {
  const warehouses = getLocations().filter((l) => l.kind === "warehouse");
  if (shouldUseDemoFallback() && warehouses.length === 0) {
    return DEMO_WAREHOUSE_HUBS.map(normalize);
  }
  return warehouses;
}

export function getLocationById(id: string): StockLocation | undefined {
  ensureHydrationKickoff();
  return cache.find((l) => l.id === id);
}

export function addLocation(input: LocationInput): StockLocation {
  const optimistic = normalize({
    ...input,
    id: `loc_pending_${Date.now()}`,
    active: true,
    registers: input.registers ?? ["Register 1"],
  });
  const previous = cache;
  applyCache([...cache, optimistic]);

  if (!isLocationBackend()) return optimistic;

  persistInBackground(
    async () => {
      const saved = await locationBridge.createLocationRemote(input);
      applyCache(cache.map((l) => (l.id === optimistic.id ? saved : l)));
    },
    () => {
      cache = previous;
    },
  );

  return optimistic;
}

export function updateLocation(id: string, patch: Partial<LocationInput & { active: boolean }>): void {
  const previous = cache;
  applyCache(cache.map((l) => (l.id === id ? normalize({ ...l, ...patch }) : l)));

  if (!isLocationBackend()) return;

  persistInBackground(
    async () => {
      const saved = await locationBridge.updateLocationRemote(id, patch);
      applyCache(cache.map((l) => (l.id === id ? saved : l)));
    },
    () => {
      cache = previous;
    },
  );
}

export function archiveLocation(id: string): void {
  const previous = cache;
  applyCache(cache.map((l) => (l.id === id ? normalize({ ...l, active: false }) : l)));

  if (!isLocationBackend()) return;

  persistInBackground(
    async () => {
      const saved = await locationBridge.archiveLocationRemote(id);
      applyCache(cache.map((l) => (l.id === id ? saved : l)));
    },
    () => {
      cache = previous;
    },
  );
}

/** When exactly one active store exists, POS can hide the selector. */
export function getDefaultPosStoreId(): string | null {
  const stores = getStores();
  if (stores.length === 1) return stores[0].id;
  return stores[0]?.id ?? null;
}

export function locationIds(): string[] {
  return getLocations().map((l) => l.id);
}

export function emptyStockMap(seed = 0): Record<string, number> {
  return Object.fromEntries(getLocations().map((l) => [l.id, seed || 0]));
}
