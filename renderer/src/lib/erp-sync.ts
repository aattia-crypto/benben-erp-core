/**
 * Cross-module ERP synchronization bus.
 * Stores call `publishErpChange` after mutations; UI and integrators subscribe for instant refresh.
 * (Prisma-backed modules can hook the same bus from IPC later without changing consumers.)
 */

export type ErpModule =
  | "inventory"
  | "pos"
  | "ar"
  | "ap"
  | "sales"
  | "gl"
  | "crm"
  | "purchasing"
  | "manufacturing"
  | "imports"
  | "dashboard";

export type ErpChangeEvent = {
  module: ErpModule;
  action: string;
  entityId?: string;
  at: string;
};

type Listener = (event: ErpChangeEvent) => void;

const globalListeners = new Set<Listener>();
const moduleListeners = new Map<ErpModule, Set<Listener>>();

export function publishErpChange(
  module: ErpModule,
  action: string,
  entityId?: string,
): ErpChangeEvent {
  const event: ErpChangeEvent = { module, action, entityId, at: new Date().toISOString() };
  globalListeners.forEach((fn) => fn(event));
  moduleListeners.get(module)?.forEach((fn) => fn(event));
  return event;
}

/** Subscribe to all module changes (dashboard, cross-module views). */
export function subscribeErp(fn: Listener): () => void {
  globalListeners.add(fn);
  return () => globalListeners.delete(fn);
}

/** Subscribe to a single module. */
export function subscribeErpModule(module: ErpModule, fn: Listener): () => void {
  if (!moduleListeners.has(module)) moduleListeners.set(module, new Set());
  moduleListeners.get(module)!.add(fn);
  return () => moduleListeners.get(module)?.delete(fn);
}
