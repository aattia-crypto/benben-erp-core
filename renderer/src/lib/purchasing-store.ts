import {
  DEMO_GOODS_RECEIPTS,
  DEMO_PURCHASE_ORDERS,
  shouldUseDemoFallback,
} from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import * as purchasingBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type POStatus = purchasingBridge.POStatus;
export type POLine = purchasingBridge.POLine;
export type PurchaseOrder = purchasingBridge.PurchaseOrder;
export type POLogEntry = purchasingBridge.POLogEntry;
export type GoodsReceipt = purchasingBridge.GoodsReceipt;
export type CreatePOInput = purchasingBridge.CreatePOInput;

type Store = purchasingBridge.PurchasingState & { logsByPo: Record<string, POLogEntry[]> };

const listeners = new Set<() => void>();
let cache: Store = { orders: [], receipts: [], logsByPo: {} };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function normalizeOrder(o: PurchaseOrder): PurchaseOrder {
  return {
    ...o,
    warehouseId: o.warehouseId ?? "loc_wh_central",
    expectedDelivery: o.expectedDelivery ?? o.createdAt,
    taxAmount: o.taxAmount ?? 0,
    shippingAmount: o.shippingAmount ?? 0,
  };
}

function emptyStore(): Store {
  return { orders: [], receipts: [], logsByPo: {} };
}

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: Store) {
  cache = {
    orders: next.orders.map(normalizeOrder),
    receipts: next.receipts,
    logsByPo: next.logsByPo ?? cache.logsByPo,
  };
  emit();
}

function appendLocalLog(
  poId: string,
  entry: Omit<POLogEntry, "id" | "poId" | "createdAt"> & { createdAt?: string },
): void {
  const log: POLogEntry = {
    id: uid("pol"),
    poId,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    comment: entry.comment,
  };
  cache.logsByPo = {
    ...cache.logsByPo,
    [poId]: [...(cache.logsByPo[poId] ?? []), log],
  };
}

export function resetPurchasingStore(): void {
  cache = emptyStore();
  hydrated = false;
  hydratePromise = null;
  emit();
}

export function subscribePurchasing(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidatePurchasingHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

function seedPurchasingFromDemo(): void {
  cache = {
    orders: DEMO_PURCHASE_ORDERS.map(normalizeOrder),
    receipts: DEMO_GOODS_RECEIPTS.map((r) => ({ ...r })),
    logsByPo: {},
  };
}

/** Presenter Mode: fill cache immediately (no IPC). */
export function applyDemoFallbackSeed(): void {
  if (!isDemoBuild()) return;
  seedPurchasingFromDemo();
  hydrated = true;
  emit();
}

export async function hydratePurchasingStore(): Promise<void> {
  if (isDemoBuild()) {
    applyDemoFallbackSeed();
  }
  if (!isOperationsBackend()) return;
  if (!isDemoBuild() && hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const state = await purchasingBridge.fetchPurchasingState();
        if (isDemoBuild()) {
          if (state.orders.length > 0) {
            cache = {
              orders: state.orders.map(normalizeOrder),
              receipts: state.receipts,
              logsByPo: {},
            };
            emit();
          }
          return;
        }
        cache = {
          orders: state.orders.map(normalizeOrder),
          receipts: state.receipts,
          logsByPo: {},
        };
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
  void hydratePurchasingStore();
}

export function getPurchaseOrders(): PurchaseOrder[] {
  ensureHydrationKickoff();
  if (shouldUseDemoFallback() && cache.orders.length === 0) {
    applyDemoFallbackSeed();
  }
  return cache.orders.length > 0
    ? cache.orders
    : shouldUseDemoFallback()
      ? DEMO_PURCHASE_ORDERS.map(normalizeOrder)
      : cache.orders;
}

export function getPendingApprovalOrders(): PurchaseOrder[] {
  return getPurchaseOrders().filter((o) => o.status === "pending_approval");
}

export function poMerchandiseTotal(o: PurchaseOrder): number {
  return o.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
}

export function poGrandTotal(o: PurchaseOrder): number {
  return poMerchandiseTotal(o) + o.taxAmount + o.shippingAmount;
}

export function getPoLogs(poId: string): POLogEntry[] {
  return cache.logsByPo[poId] ?? [];
}

export async function loadPoLogs(poId: string): Promise<POLogEntry[]> {
  if (!isOperationsBackend()) return getPoLogs(poId);
  const logs = await purchasingBridge.fetchPoLogRemote(poId);
  cache.logsByPo = { ...cache.logsByPo, [poId]: logs };
  emit();
  return logs;
}

export function createPurchaseOrder(input: CreatePOInput): PurchaseOrder {
  const po: PurchaseOrder = normalizeOrder({
    id: uid("po"),
    poNumber:
      input.poNumber?.trim() ||
      `PO-${new Date().getFullYear()}-${String(cache.orders.length + 1).padStart(4, "0")}`,
    vendorCode: input.vendorCode,
    vendorName: input.vendorName,
    status: input.status,
    lines: input.lines,
    warehouseId: input.warehouseId,
    expectedDelivery: input.expectedDelivery,
    taxAmount: input.taxAmount,
    shippingAmount: input.shippingAmount,
    notes: input.notes,
    requestedByUserId: input.requestedByUserId,
    requestedByName: input.requestedByName,
    createdAt: new Date().toISOString().slice(0, 10),
  });
  const previous = cache;
  applyCache({ ...cache, orders: [po, ...cache.orders] });
  appendLocalLog(po.id, {
    action: "created",
    toStatus: po.status,
    actorName: input.requestedByName,
    actorUserId: input.requestedByUserId,
    comment: po.status === "pending_approval" ? "Submitted for finance approval" : "Draft created",
  });
  if (po.status === "pending_approval") {
    appendLocalLog(po.id, {
      action: "submitted",
      fromStatus: "draft",
      toStatus: "pending_approval",
      actorName: input.requestedByName,
      actorUserId: input.requestedByUserId,
      comment: "Awaiting finance department review",
    });
  }

  if (!isOperationsBackend()) return po;

  persistInBackground(
    "purchasing-store",
    async () => {
      const saved = await purchasingBridge.createPurchaseOrderRemote(po);
      applyCache({
        ...cache,
        orders: [normalizeOrder(saved), ...cache.orders.filter((o) => o.id !== po.id)],
      });
      await loadPoLogs(saved.id);
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return po;
}

/** @deprecated Use createPurchaseOrder */
export function createPO(vendorCode: string, vendorName: string, lines: POLine[]): PurchaseOrder {
  return createPurchaseOrder({
    vendorCode,
    vendorName,
    warehouseId: "loc_wh_central",
    expectedDelivery: new Date().toISOString().slice(0, 10),
    taxAmount: 0,
    shippingAmount: 0,
    status: "draft",
    lines,
  });
}

function patchOrder(id: string, patch: Partial<PurchaseOrder>): void {
  applyCache({
    ...cache,
    orders: cache.orders.map((o) => (o.id === id ? normalizeOrder({ ...o, ...patch }) : o)),
  });
}

export function submitPOForApproval(id: string): void {
  const previous = cache;
  const order = cache.orders.find((o) => o.id === id);
  if (!order || order.status !== "draft") return;
  patchOrder(id, { status: "pending_approval" });
  appendLocalLog(id, {
    action: "submitted",
    fromStatus: "draft",
    toStatus: "pending_approval",
    comment: "Submitted to finance for approval",
  });
  if (!isOperationsBackend()) return;
  persistInBackground(
    "purchasing-store",
    async () => {
      const saved = await purchasingBridge.submitPORemote(id);
      patchOrder(id, saved);
      await loadPoLogs(id);
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function approvePO(id: string): void {
  const previous = cache;
  patchOrder(id, { status: "approved", approvedAt: new Date().toISOString().slice(0, 10) });
  appendLocalLog(id, {
    action: "approved",
    fromStatus: "pending_approval",
    toStatus: "approved",
    comment: "Approved by finance",
  });
  if (!isOperationsBackend()) return;
  persistInBackground(
    "purchasing-store",
    async () => {
      const saved = await purchasingBridge.approvePORemote(id);
      patchOrder(id, saved);
      await loadPoLogs(id);
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function denyPO(id: string, reason: string): void {
  const previous = cache;
  const trimmed = reason.trim();
  patchOrder(id, {
    status: "denied",
    deniedAt: new Date().toISOString().slice(0, 10),
    denialReason: trimmed,
  });
  appendLocalLog(id, {
    action: "denied",
    fromStatus: "pending_approval",
    toStatus: "denied",
    comment: trimmed,
  });
  if (!isOperationsBackend()) return;
  persistInBackground(
    "purchasing-store",
    async () => {
      const saved = await purchasingBridge.denyPORemote(id, trimmed);
      patchOrder(id, saved);
      await loadPoLogs(id);
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function receivePO(id: string, sku: string, qty: number): GoodsReceipt {
  const receipt: GoodsReceipt = {
    id: uid("gr"),
    poId: id,
    receivedAt: new Date().toISOString(),
    sku,
    qty,
  };
  const previous = cache;
  applyCache({
    ...cache,
    receipts: [receipt, ...cache.receipts],
    orders: cache.orders.map((o) => (o.id === id ? { ...o, status: "received" } : o)),
  });
  appendLocalLog(id, {
    action: "received",
    fromStatus: "approved",
    toStatus: "received",
    comment: `Received ${qty} × ${sku}`,
  });

  if (!isOperationsBackend()) return receipt;

  persistInBackground(
    "purchasing-store",
    async () => {
      const result = await purchasingBridge.receivePORemote(id, sku, qty);
      applyCache({
        receipts: [result.receipt, ...cache.receipts.filter((r) => r.id !== receipt.id)],
        orders: cache.orders.map((o) => (o.id === id ? normalizeOrder(result.order) : o)),
      });
      await loadPoLogs(id);
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return receipt;
}
