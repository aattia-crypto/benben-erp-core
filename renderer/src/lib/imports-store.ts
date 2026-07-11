/**
 * Import shipments: FOB merchandise + tariff % + flat customs/fees + freight/insurance.
 */
import { applyWeightedUnitCosts } from "./inventory-store";
import * as importsBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type ImportLine = importsBridge.ImportLine;
export type ImportShipment = importsBridge.ImportShipment;

export class ImportLineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportLineValidationError";
  }
}

/** Reject shipments with unmapped or invalid line rows — never inject placeholder SKUs. */
export function validateImportLines(
  lines: ImportLine[] | undefined | null,
  context: string,
): ImportLine[] {
  const list = lines ?? [];
  return list.map((line, index) => {
    const sku = line.sku?.trim() ?? "";
    if (!sku) {
      throw new ImportLineValidationError(
        `${context}: line ${index + 1} has no SKU. Map each import line to an inventory item before saving.`,
      );
    }
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new ImportLineValidationError(
        `${context}: line ${index + 1} (${sku}) must have quantity greater than zero.`,
      );
    }
    const unitValue = Number(line.unitValue);
    if (!Number.isFinite(unitValue) || unitValue < 0) {
      throw new ImportLineValidationError(
        `${context}: line ${index + 1} (${sku}) must have a valid unit value.`,
      );
    }
    return {
      id: line.id || uid("il"),
      sku,
      description: line.description?.trim() || sku,
      qty,
      unitValue,
    };
  });
}

/** Drop corrupt legacy rows on read — never inject placeholder SKUs. */
function sanitizeImportLinesFromDb(
  lines: ImportLine[] | undefined | null,
  context: string,
): ImportLine[] {
  const list = lines ?? [];
  const valid: ImportLine[] = [];
  for (let i = 0; i < list.length; i++) {
    const line = list[i];
    const sku = line.sku?.trim() ?? "";
    if (!sku) {
      console.warn(`${context}: dropping line ${i + 1} with no SKU.`);
      continue;
    }
    const qty = Number(line.qty);
    const unitValue = Number(line.unitValue);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitValue) || unitValue < 0) {
      console.warn(`${context}: dropping invalid line ${i + 1} (${sku}).`);
      continue;
    }
    valid.push({
      id: line.id || uid("il"),
      sku,
      description: line.description?.trim() || sku,
      qty,
      unitValue,
    });
  }
  return valid;
}

type Store = { shipments: ImportShipment[] };

const listeners = new Set<() => void>();
let cache: Store = { shipments: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function normalizeShipment(s: ImportShipment, options?: { strict?: boolean }): ImportShipment {
  const context = `Shipment ${s.reference || s.id}`;
  const lines = options?.strict
    ? validateImportLines(s.lines, context)
    : sanitizeImportLinesFromDb(s.lines, context);
  const next = {
    ...s,
    lines,
    customsFees: s.customsFees ?? 0,
    freightCost: s.freightCost ?? 0,
    insuranceCost: s.insuranceCost ?? 0,
    attachments: s.attachments ?? [],
  };
  return { ...next, landedCost: computeLandedCost(next) };
}

function emptyStore(): Store {
  return { shipments: [] };
}

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: Store) {
  cache = { shipments: next.shipments.map(normalizeShipment) };
  emit();
}

/** Merchandise value (FOB) for all lines. */
export function merchandiseValue(shipment: Pick<ImportShipment, "lines">): number {
  return shipment.lines.reduce((s, l) => s + l.qty * l.unitValue, 0);
}

/** Total landed cost = FOB + ad-valorem duty + flat customs + freight + insurance. */
export function computeLandedCost(
  shipment: Pick<
    ImportShipment,
    "lines" | "customsTariffPct" | "customsFees" | "freightCost" | "insuranceCost"
  >,
): number {
  const fob = merchandiseValue(shipment);
  const duty = fob * (shipment.customsTariffPct / 100);
  return Math.round((fob + duty + shipment.customsFees + shipment.freightCost + shipment.insuranceCost) * 100) / 100;
}

export function resetImportsStore(): void {
  cache = emptyStore();
  hydrated = false;
  hydratePromise = null;
  emit();
}

export function subscribeImports(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateImportsHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydrateImportsStore(): Promise<void> {
  if (!isOperationsBackend()) {
    return;
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = importsBridge.fetchImportShipments().then((shipments) => {
      cache = { shipments: shipments.map(normalizeShipment) };
      hydrated = true;
      emit();
    }).catch((err) => {
      hydratePromise = null;
      throw err;
    });
  }
  await hydratePromise;
}

function ensureHydrationKickoff(): void {
  if (!isOperationsBackend() || hydrated || hydratePromise) return;
  void hydrateImportsStore();
}

export function getShipments(): ImportShipment[] {
  ensureHydrationKickoff();
  return cache.shipments;
}

export function createShipment(
  input: Omit<ImportShipment, "id" | "attachments" | "landedCost" | "landedCostApplied">,
): ImportShipment {
  validateImportLines(input.lines, `Shipment ${input.reference}`);
  const shipment = normalizeShipment({ ...input, id: uid("sh"), attachments: [] }, { strict: true });
  const previous = cache;
  applyCache({ ...cache, shipments: [shipment, ...cache.shipments] });

  if (!isOperationsBackend()) return shipment;

  persistInBackground(
    "imports-store",
    async () => {
      const saved = await importsBridge.createShipmentRemote(shipment);
      applyCache({
        shipments: [normalizeShipment(saved), ...cache.shipments.filter((s) => s.id !== shipment.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return shipment;
}

export function updateShipment(id: string, patch: Partial<ImportShipment>): void {
  if (patch.lines) {
    const ref = cache.shipments.find((s) => s.id === id)?.reference ?? id;
    validateImportLines(patch.lines, `Shipment ${ref}`);
  }
  const previous = cache;
  applyCache({
    shipments: cache.shipments.map((s) =>
      s.id === id ? normalizeShipment({ ...s, ...patch }, { strict: !!patch.lines }) : s,
    ),
  });

  if (!isOperationsBackend()) return;

  persistInBackground(
    "imports-store",
    async () => {
      const saved = await importsBridge.updateShipmentRemote(id, patch);
      applyCache({
        shipments: cache.shipments.map((s) => (s.id === id ? normalizeShipment(saved) : s)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function attachFile(shipmentId: string, name: string, size: number): void {
  const previous = cache;
  applyCache({
    shipments: cache.shipments.map((s) =>
      s.id === shipmentId
        ? {
            ...s,
            attachments: [
              { id: uid("att"), name, size, at: new Date().toISOString() },
              ...s.attachments,
            ],
          }
        : s,
    ),
  });

  if (!isOperationsBackend()) return;

  persistInBackground(
    "imports-store",
    async () => {
      const saved = await importsBridge.attachFileRemote(shipmentId, name, size);
      applyCache({
        shipments: cache.shipments.map((s) => (s.id === shipmentId ? normalizeShipment(saved) : s)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function applyLandedCostToInventory(shipmentId: string): boolean {
  const shipment = cache.shipments.find((s) => s.id === shipmentId);
  if (!shipment || shipment.landedCostApplied) return false;
  if (!shipment.lines.length) return false;
  const fob = merchandiseValue(shipment);
  if (fob <= 0) return false;

  const total = computeLandedCost(shipment);
  const allocations = shipment.lines.map((l) => {
    const lineFob = l.qty * l.unitValue;
    const share = lineFob / fob;
    const allocated = total * share;
    const landedUnit = l.qty > 0 ? allocated / l.qty : l.unitValue;
    return { sku: l.sku, landedUnitCost: Math.round(landedUnit * 100) / 100 };
  });
  applyWeightedUnitCosts(allocations, `Import ${shipment.reference} landed cost`);
  updateShipment(shipmentId, { landedCostApplied: true, status: "delivered" });

  if (isOperationsBackend()) {
    void importsBridge.applyLandedCostRemote(shipmentId).catch(console.error);
  }
  return true;
}
