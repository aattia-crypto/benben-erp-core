/**
 * Blind-Spot Ledger — tribal knowledge vault with PostgreSQL persistence.
 */
import { getSession } from "./auth-store";
import * as blindSpotBridge from "./operations-bridge";
import { isOperationsBackend } from "./store-persist";
import { uid } from "./storage";

export type BlindSpotSeverity = blindSpotBridge.BlindSpotSeverity;
export type BlindSpotCategory = blindSpotBridge.BlindSpotCategory;
export type BlindSpotEntry = blindSpotBridge.BlindSpotEntry;
export type BlindSpotQuery = blindSpotBridge.BlindSpotQuery;

const listeners = new Set<() => void>();
let cache: BlindSpotEntry[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: BlindSpotEntry[]) {
  cache = next;
  emit();
}

function mergeEntry(saved: BlindSpotEntry) {
  applyCache([saved, ...cache.filter((e) => e.id !== saved.id)]);
}

export function subscribeBlindSpotStore(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateBlindSpotHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydrateBlindSpotStore(): Promise<void> {
  if (!isOperationsBackend()) return;
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = blindSpotBridge
      .getBlindSpotsForEntityRemote({})
      .then((entries) => {
        cache = entries;
        hydrated = true;
        emit();
      })
      .catch((err) => {
        hydratePromise = null;
        throw err;
      });
  }
  await hydratePromise;
}

function ensureHydrationKickoff(): void {
  if (!isOperationsBackend() || hydrated || hydratePromise) return;
  void hydrateBlindSpotStore();
}

export function getBlindSpotEntries(): BlindSpotEntry[] {
  ensureHydrationKickoff();
  return cache;
}

function isGlobalEntry(e: BlindSpotEntry): boolean {
  return !e.partyId && !e.customerCode && !e.sku;
}

function findInCache(query: BlindSpotQuery): BlindSpotEntry[] {
  const entityId = query.entityId?.trim();
  const customerCode = query.customerCode?.trim().toUpperCase();
  const sku = query.sku?.trim().toUpperCase();
  const skus = new Set((query.skus ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean));

  const matched = cache.filter((e) => {
    if (entityId && e.partyId === entityId) return true;
    if (customerCode && e.customerCode?.toUpperCase() === customerCode) return true;
    if (sku && e.sku?.toUpperCase() === sku) return true;
    if (e.sku && skus.has(e.sku.toUpperCase())) return true;
    return false;
  });

  const globals = cache.filter(isGlobalEntry);
  const merged = new Map<string, BlindSpotEntry>();
  for (const row of [...matched, ...globals]) merged.set(row.id, row);
  return [...merged.values()];
}

/** Query ledger for contextual warnings — uses cache when hydrated, else fetches from PG. */
export async function queryBlindSpots(query: BlindSpotQuery): Promise<BlindSpotEntry[]> {
  const hasFilter = !!(
    query.entityId?.trim() ||
    query.customerCode?.trim() ||
    query.sku?.trim() ||
    (query.skus?.length ?? 0) > 0
  );
  if (!hasFilter) return [];

  if (isOperationsBackend()) {
    await hydrateBlindSpotStore();
    const remote = await blindSpotBridge.getBlindSpotsForEntityRemote(query);
    const merged = [...cache];
    for (const row of remote) {
      const idx = merged.findIndex((m) => m.id === row.id);
      if (idx >= 0) merged[idx] = row;
      else merged.push(row);
    }
    applyCache(merged);
    return remote;
  }

  return findInCache(query);
}

export type CreateBlindSpotInput = Omit<BlindSpotEntry, "id" | "createdAt" | "updatedAt" | "createdBy"> & {
  id?: string;
  /** Absolute path on disk — copied via IPC before create (desktop only). */
  videoSourcePath?: string;
};

export async function createBlindSpotEntry(
  input: CreateBlindSpotInput,
): Promise<BlindSpotEntry> {
  const now = new Date().toISOString();
  const session = getSession();
  const id = input.id ?? uid("bs");
  let videoFilePath = input.videoFilePath;

  if (input.videoSourcePath?.trim() && isOperationsBackend()) {
    videoFilePath = await blindSpotBridge.uploadBlindSpotVideoRemote(id, input.videoSourcePath.trim());
  }

  const body =
    input.body.trim() ||
    input.voiceTranscript?.trim() ||
    (videoFilePath ? "Video tip" : "");

  const entry: BlindSpotEntry = {
    id,
    title: input.title.trim(),
    body,
    severity: input.severity,
    category: input.category ?? "operational",
    partyId: input.partyId,
    customerCode: input.customerCode?.trim().toUpperCase(),
    sku: input.sku?.trim().toUpperCase(),
    videoFilePath,
    voiceTranscript: input.voiceTranscript?.trim() || undefined,
    createdBy: session?.name || session?.username,
    createdAt: now,
    updatedAt: now,
  };

  const previous = [...cache];
  applyCache([entry, ...cache]);

  if (!isOperationsBackend()) return entry;

  try {
    const saved = await blindSpotBridge.createBlindSpotEntryRemote(entry);
    mergeEntry(saved);
    return saved;
  } catch (err) {
    cache = previous;
    emit();
    throw err;
  }
}

export async function updateBlindSpotEntry(
  id: string,
  patch: Partial<Omit<BlindSpotEntry, "id" | "createdAt" | "updatedAt">>,
): Promise<BlindSpotEntry> {
  const existing = cache.find((e) => e.id === id);
  if (!existing && isOperationsBackend()) {
    await hydrateBlindSpotStore();
  }
  const base = cache.find((e) => e.id === id);
  if (!base) throw new Error("Blind-spot entry not found.");

  const optimistic: BlindSpotEntry = {
    ...base,
    ...patch,
    title: patch.title?.trim() ?? base.title,
    body: patch.body?.trim() ?? base.body,
    customerCode: patch.customerCode?.trim().toUpperCase() ?? base.customerCode,
    sku: patch.sku?.trim().toUpperCase() ?? base.sku,
    updatedAt: new Date().toISOString(),
  };

  const previous = [...cache];
  mergeEntry(optimistic);

  if (!isOperationsBackend()) return optimistic;

  try {
    const saved = await blindSpotBridge.updateBlindSpotEntryRemote(id, patch);
    mergeEntry(saved);
    return saved;
  } catch (err) {
    cache = previous;
    emit();
    throw err;
  }
}

export async function deleteBlindSpotEntry(id: string): Promise<void> {
  const previous = [...cache];
  applyCache(cache.filter((e) => e.id !== id));

  if (!isOperationsBackend()) return;

  try {
    await blindSpotBridge.deleteBlindSpotEntryRemote(id);
  } catch (err) {
    cache = previous;
    emit();
    throw err;
  }
}

/** @alias createBlindSpotEntry */
export const createEntry = createBlindSpotEntry;

export function resetBlindSpotStore(): void {
  cache = [];
  hydrated = false;
  hydratePromise = null;
  emit();
}
