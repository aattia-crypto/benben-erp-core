import type { ProductionBatch, ProductionStage, StageStatus } from "./mock-data";
import {
  DEMO_BATCHES,
  DEMO_BOMS,
  DEMO_LABOR,
  DEMO_MATERIAL_USAGE,
  shouldUseDemoFallback,
} from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import * as mfgBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type BomLine = mfgBridge.BomLine;
export type BomVersion = mfgBridge.BomVersion;
export type MaterialUsage = mfgBridge.MaterialUsage;
export type LaborEntry = mfgBridge.LaborEntry;
export type NewBatchInput = mfgBridge.NewBatchInput;

type Store = mfgBridge.ManufacturingState;

const listeners = new Set<() => void>();
let cache: Store = { batches: [], boms: [], materialUsage: [], labor: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emptyStore(): Store {
  return { batches: [], boms: [], materialUsage: [], labor: [] };
}

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: Store) {
  cache = next;
  emit();
}

export function resetManufacturingStore(): void {
  cache = emptyStore();
  hydrated = false;
  hydratePromise = null;
  emit();
}

export function subscribeManufacturing(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateManufacturingHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

function seedManufacturingFromDemo(): void {
  cache = {
    batches: DEMO_BATCHES.map((b) => ({ ...b, stages: b.stages.map((s) => ({ ...s })) })),
    boms: DEMO_BOMS.map((b) => ({ ...b, lines: b.lines.map((l) => ({ ...l })) })),
    materialUsage: DEMO_MATERIAL_USAGE.map((m) => ({ ...m })),
    labor: DEMO_LABOR.map((l) => ({ ...l })),
  };
}

/** Presenter Mode: fill cache immediately (no IPC). */
export function applyDemoFallbackSeed(): void {
  if (!isDemoBuild()) return;
  seedManufacturingFromDemo();
  hydrated = true;
  emit();
}

export async function hydrateManufacturingStore(): Promise<void> {
  if (isDemoBuild()) {
    applyDemoFallbackSeed();
  }
  if (!isOperationsBackend()) return;
  if (!isDemoBuild() && hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const state = await mfgBridge.fetchManufacturingState();
        if (isDemoBuild()) {
          if (state.batches.length > 0) {
            cache = state;
            emit();
          }
          return;
        }
        cache = state;
        hydrated = true;
        emit();
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
  if (!isOperationsBackend() || hydrated || hydratePromise) return;
  void hydrateManufacturingStore();
}

export function getBatches(): ProductionBatch[] {
  ensureHydrationKickoff();
  if (shouldUseDemoFallback() && cache.batches.length === 0) {
    applyDemoFallbackSeed();
  }
  return cache.batches.length > 0 ? cache.batches : shouldUseDemoFallback() ? DEMO_BATCHES : cache.batches;
}

export function getBoms(): BomVersion[] {
  ensureHydrationKickoff();
  if (shouldUseDemoFallback() && cache.boms.length === 0) {
    applyDemoFallbackSeed();
  }
  return cache.boms.length > 0 ? cache.boms : shouldUseDemoFallback() ? DEMO_BOMS : cache.boms;
}

export function getMaterialUsage(batchId?: string): MaterialUsage[] {
  ensureHydrationKickoff();
  const materialUsage =
    shouldUseDemoFallback() && cache.materialUsage.length === 0
      ? DEMO_MATERIAL_USAGE
      : cache.materialUsage;
  return batchId ? materialUsage.filter((m) => m.batchId === batchId) : materialUsage;
}

export function getLaborEntries(batchId?: string): LaborEntry[] {
  ensureHydrationKickoff();
  const labor =
    shouldUseDemoFallback() && cache.labor.length === 0 ? DEMO_LABOR : cache.labor;
  return batchId ? labor.filter((l) => l.batchId === batchId) : labor;
}

export function createBatch(input: NewBatchInput): ProductionBatch {
  const previous = cache;
  const optimistic: ProductionBatch = {
    id: uid("b"),
    code: `PB-pending`,
    product: input.product.trim(),
    client: input.client.trim(),
    units: input.units,
    startedAt: new Date().toISOString().slice(0, 10),
    expectedCompletion: input.expectedCompletion,
    cycleMonths: input.cycleMonths,
    stages: [],
    wipValue: 0,
    status: "planning",
  };
  applyCache({ ...cache, batches: [optimistic, ...cache.batches] });

  if (!isOperationsBackend()) return optimistic;

  persistInBackground(
    "manufacturing-store",
    async () => {
      const saved = await mfgBridge.createBatchRemote(input);
      applyCache({
        ...cache,
        batches: [saved, ...cache.batches.filter((b) => b.id !== optimistic.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return optimistic;
}

export function updateBatchStatus(batchId: string, status: ProductionBatch["status"]): void {
  const previous = cache;
  applyCache({
    ...cache,
    batches: cache.batches.map((b) => (b.id === batchId ? { ...b, status } : b)),
  });
  if (!isOperationsBackend()) return;
  persistInBackground(
    "manufacturing-store",
    async () => {
      const saved = await mfgBridge.updateBatchStatusRemote(batchId, status);
      applyCache({
        ...cache,
        batches: cache.batches.map((b) => (b.id === batchId ? saved : b)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function updateStageStatus(batchId: string, stageId: string, status: StageStatus): void {
  const previous = cache;
  applyCache({
    ...cache,
    batches: cache.batches.map((b) =>
      b.id !== batchId
        ? b
        : {
            ...b,
            stages: b.stages.map((s: ProductionStage) =>
              s.id === stageId ? { ...s, status } : s,
            ),
            status: status === "in_progress" ? "active" : b.status,
          },
    ),
  });
  if (!isOperationsBackend()) return;
  persistInBackground(
    "manufacturing-store",
    async () => {
      const saved = await mfgBridge.updateStageStatusRemote(batchId, stageId, status);
      applyCache({
        ...cache,
        batches: cache.batches.map((b) => (b.id === batchId ? saved : b)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function recordMaterialUsage(batchId: string, sku: string, qty: number): void {
  const entry: MaterialUsage = {
    id: uid("mu"),
    batchId,
    sku,
    qty,
    at: new Date().toISOString(),
  };
  const previous = cache;
  applyCache({ ...cache, materialUsage: [entry, ...cache.materialUsage] });
  void import("./inventory-store").then(({ adjustStock }) =>
    adjustStock(sku, qty, "issue", `WIP batch ${batchId}`),
  );
  if (!isOperationsBackend()) return;
  persistInBackground(
    "manufacturing-store",
    async () => {
      const saved = await mfgBridge.recordMaterialUsageRemote(batchId, sku, qty);
      applyCache({
        ...cache,
        materialUsage: [saved, ...cache.materialUsage.filter((m) => m.id !== entry.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function recordLabor(batchId: string, stageId: string, hours: number, rate = 78): void {
  const entry: LaborEntry = {
    id: uid("lb"),
    batchId,
    stageId,
    hours,
    rate,
    at: new Date().toISOString(),
  };
  const previous = cache;
  applyCache({
    ...cache,
    labor: [entry, ...cache.labor],
    batches: cache.batches.map((b) => {
      if (b.id !== batchId) return b;
      return {
        ...b,
        stages: b.stages.map((s: ProductionStage) =>
          s.id === stageId
            ? {
                ...s,
                laborHours: s.laborHours + hours,
                laborCost: s.laborCost + hours * rate,
                status: s.status === "pending" ? "in_progress" : s.status,
              }
            : s,
        ),
        wipValue: b.wipValue + hours * rate,
      };
    }),
  });
  if (!isOperationsBackend()) return;
  persistInBackground(
    "manufacturing-store",
    async () => {
      const result = await mfgBridge.recordLaborRemote(batchId, stageId, hours, rate);
      applyCache({
        ...cache,
        labor: [result.entry, ...cache.labor.filter((l) => l.id !== entry.id)],
        batches: cache.batches.map((b) => (b.id === batchId ? result.batch : b)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

function normalizeBom(b: BomVersion): BomVersion {
  return {
    ...b,
    bomCode: b.bomCode ?? `BOM-${b.productSku}`,
    name: b.name ?? b.productSku,
  };
}

export function saveBom(bom: Omit<BomVersion, "id"> & { id?: string }): BomVersion {
  const prev = cache.boms.filter((b) => b.productSku === bom.productSku);
  const version = bom.version || (prev.length ? `${prev.length + 1}.0` : "1.0");
  const next: BomVersion = normalizeBom({
    ...bom,
    version,
    id: bom.id ?? uid("bom"),
    bomCode: bom.bomCode ?? `BOM-${bom.productSku}`,
    name: bom.name ?? bom.productSku,
    lines: bom.lines,
  });
  const previous = cache;
  const exists = cache.boms.some((b) => b.id === next.id);
  const boms = exists
    ? cache.boms.map((b) => (b.id === next.id ? next : normalizeBom(b)))
    : [next, ...cache.boms.map(normalizeBom)];
  applyCache({ ...cache, boms });

  if (!isOperationsBackend()) return next;

  persistInBackground(
    "manufacturing-store",
    async () => {
      const saved = await mfgBridge.saveBomRemote(next);
      const merged = exists
        ? cache.boms.map((b) => (b.id === saved.id ? saved : b))
        : [saved, ...cache.boms.filter((b) => b.id !== next.id)];
      applyCache({ ...cache, boms: merged });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return next;
}

export function createBomVersion(
  productSku: string,
  lines: BomLine[],
  notes?: string,
  meta?: { bomCode?: string; name?: string },
): BomVersion {
  const prev = cache.boms.filter((b) => b.productSku === productSku);
  const major = prev.length + 1;
  return saveBom({
    bomCode: meta?.bomCode ?? `BOM-${productSku}`,
    name: meta?.name ?? productSku,
    version: `${major}.0`,
    productSku,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    lines,
    notes,
  });
}
