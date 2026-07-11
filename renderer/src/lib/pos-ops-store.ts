/**
 * POS operations: online order queue, returns, void audit trail.
 */
import { publishErpChange } from "./erp-sync";
import * as posBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type OnlineOrderStatus = posBridge.OnlineOrderStatus;
export type OnlineOrder = posBridge.OnlineOrder;
export type PosReturn = posBridge.PosReturn;
export type VoidAudit = posBridge.VoidAudit;

type Store = posBridge.PosOpsState;

const listeners = new Set<() => void>();
let cache: Store = { onlineOrders: [], returns: [], voids: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
  publishErpChange("pos", "ops-updated");
}

function applyCache(next: Store) {
  cache = next;
  emit();
}

export function subscribePosOps(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidatePosOpsHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydratePosOpsStore(): Promise<void> {
  if (!isOperationsBackend()) {
    return;
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = posBridge.fetchPosOpsState().then((state) => {
      cache = state;
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
  void hydratePosOpsStore();
}

export function getOnlineOrders(): OnlineOrder[] {
  ensureHydrationKickoff();
  return cache.onlineOrders;
}

export function createOnlineOrder(
  input: Omit<OnlineOrder, "id" | "orderNumber" | "placedAt" | "status">,
): OnlineOrder {
  const order: OnlineOrder = {
    ...input,
    id: uid("oo"),
    orderNumber: `WEB-${String(cache.onlineOrders.length + 1).padStart(5, "0")}`,
    status: "pending",
    placedAt: new Date().toISOString(),
  };
  const previous = cache;
  applyCache({ ...cache, onlineOrders: [order, ...cache.onlineOrders] });

  if (!isOperationsBackend()) return order;

  persistInBackground(
    "pos-ops-store",
    async () => {
      const saved = await posBridge.createOnlineOrderRemote(input);
      applyCache({
        ...cache,
        onlineOrders: [saved, ...cache.onlineOrders.filter((o) => o.id !== order.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return order;
}

export function updateOnlineOrderStatus(id: string, status: OnlineOrderStatus): void {
  const previous = cache;
  applyCache({
    ...cache,
    onlineOrders: cache.onlineOrders.map((o) => (o.id === id ? { ...o, status } : o)),
  });

  if (!isOperationsBackend()) return;

  persistInBackground(
    "pos-ops-store",
    async () => {
      const saved = await posBridge.updateOnlineOrderStatusRemote(id, status);
      applyCache({
        ...cache,
        onlineOrders: cache.onlineOrders.map((o) => (o.id === id ? saved : o)),
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function recordReturn(
  saleRef: string,
  lines: { sku: string; qty: number }[],
  reason: string,
  refundMethod: PosReturn["refundMethod"],
  restocked: boolean,
): PosReturn {
  const ret: PosReturn = {
    id: uid("ret"),
    saleRef,
    lines,
    reason,
    refundMethod,
    restocked,
    at: new Date().toISOString(),
  };
  const previous = cache;
  applyCache({ ...cache, returns: [ret, ...cache.returns] });
  publishErpChange("inventory", "pos-return");

  if (!isOperationsBackend()) return ret;

  persistInBackground(
    "pos-ops-store",
    async () => {
      const saved = await posBridge.recordReturnRemote(saleRef, lines, reason, refundMethod, restocked);
      applyCache({
        ...cache,
        returns: [saved, ...cache.returns.filter((r) => r.id !== ret.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return ret;
}

export function recordVoid(saleRef: string, reason: string, managerPin?: string): VoidAudit {
  const v: VoidAudit = {
    id: uid("void"),
    saleRef,
    reason,
    managerPin,
    at: new Date().toISOString(),
  };
  const previous = cache;
  applyCache({ ...cache, voids: [v, ...cache.voids] });

  if (!isOperationsBackend()) return v;

  persistInBackground(
    "pos-ops-store",
    async () => {
      const saved = await posBridge.recordVoidRemote(saleRef, reason, managerPin);
      applyCache({
        ...cache,
        voids: [saved, ...cache.voids.filter((x) => x.id !== v.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return v;
}

export function getReturns(): PosReturn[] {
  ensureHydrationKickoff();
  return cache.returns;
}

export function getVoidAudit(): VoidAudit[] {
  ensureHydrationKickoff();
  return cache.voids;
}
