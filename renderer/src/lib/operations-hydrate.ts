/**
 * Hydrates all PostgreSQL-backed operational stores after auth + migration gate.
 * Presenter Mode: seed in-memory fixtures synchronously first so UI is never blank
 * while IPC/Postgres is down or hanging.
 */
import { isDemoBuild } from "./demo-build";
import {
  applyDemoFallbackSeed as seedInventory,
  hydrateInventoryStore,
  invalidateInventoryHydration,
} from "./inventory-store";
import {
  applyDemoFallbackSeed as seedLocations,
  hydrateLocationStore,
  invalidateLocationHydration,
} from "./location-store";
import {
  applyDemoFallbackSeed as seedManufacturing,
  hydrateManufacturingStore,
  invalidateManufacturingHydration,
} from "./manufacturing-store";
import {
  applyDemoFallbackSeed as seedPurchasing,
  hydratePurchasingStore,
  invalidatePurchasingHydration,
} from "./purchasing-store";
import { hydrateImportsStore, invalidateImportsHydration } from "./imports-store";
import {
  applyDemoFallbackSeed as seedCrm,
  hydrateCrmStore,
  invalidateCrmHydration,
} from "./crm-store";
import { hydratePipelineStore, invalidatePipelineHydration } from "./crm-pipeline-store";
import { hydrateSalesStore, invalidateSalesHydration } from "./sales-store";
import { hydratePosStore, invalidatePosHydration } from "./pos-store";
import { hydratePosOpsStore, invalidatePosOpsHydration } from "./pos-ops-store";
import { hydrateLoyaltyStore, invalidateLoyaltyHydration } from "./pos-loyalty";
import { hydrateBlindSpotStore, invalidateBlindSpotHydration } from "./blind-spot-store";
import { waitForOperationsBackend, warnVolatileOperationsBackend } from "./store-persist";

export function invalidateAllOperationalHydration(): void {
  invalidateLocationHydration();
  invalidateInventoryHydration();
  invalidateManufacturingHydration();
  invalidatePurchasingHydration();
  invalidateImportsHydration();
  invalidateCrmHydration();
  invalidatePipelineHydration();
  invalidateSalesHydration();
  invalidatePosHydration();
  invalidatePosOpsHydration();
  invalidateLoyaltyHydration();
  invalidateBlindSpotHydration();
}

/** Synchronous Presenter Mode seed — call before any await so first paint is hydrated. */
export function seedAllDemoStoresNow(): void {
  if (!isDemoBuild()) return;
  seedLocations();
  seedInventory();
  seedManufacturing();
  seedPurchasing();
  seedCrm();
}

export async function hydrateAllOperationalStores(): Promise<void> {
  // Absolute visual reliability: memory fixtures first, DB second.
  if (isDemoBuild()) {
    seedAllDemoStoresNow();
  }

  const ready = await waitForOperationsBackend(isDemoBuild() ? 2_000 : 10_000);
  if (!ready) {
    warnVolatileOperationsBackend();
    if (isDemoBuild()) {
      seedAllDemoStoresNow();
    }
    return;
  }

  if (!isDemoBuild()) {
    invalidateAllOperationalHydration();
  }

  try {
    await hydrateLocationStore();
    await hydrateInventoryStore();
    await Promise.all([
      hydrateManufacturingStore(),
      hydratePurchasingStore(),
      hydrateImportsStore(),
      hydrateCrmStore(),
      hydratePipelineStore(),
      hydrateSalesStore(),
      hydratePosStore(),
      hydratePosOpsStore(),
      hydrateLoyaltyStore(),
      hydrateBlindSpotStore(),
    ]);
  } catch (err) {
    console.error("[operations-hydrate] failed to load PostgreSQL data:", err);
    if (isDemoBuild()) {
      seedAllDemoStoresNow();
      return;
    }
    throw err;
  }
}
