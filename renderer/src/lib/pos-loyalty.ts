import * as loyaltyBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type LoyaltyTier = loyaltyBridge.LoyaltyTier;
export type LoyaltyAccount = loyaltyBridge.LoyaltyAccount;

const listeners = new Set<() => void>();
let cache: LoyaltyAccount[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function applyCache(next: LoyaltyAccount[]) {
  cache = next;
  emit();
}

export function resetLoyaltyStore(): void {
  cache = [];
  hydrated = false;
  hydratePromise = null;
  emit();
}

export function subscribeLoyalty(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateLoyaltyHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydrateLoyaltyStore(): Promise<void> {
  if (!isOperationsBackend()) {
    return;
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = loyaltyBridge.fetchLoyaltyAccounts().then((accounts) => {
      cache = accounts;
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
  void hydrateLoyaltyStore();
}

export function getLoyaltyAccounts(): LoyaltyAccount[] {
  ensureHydrationKickoff();
  return cache;
}

export function earnPoints(customerCode: string, points: number, ref: string): void {
  const previous = cache;
  applyCache(
    cache.map((a) =>
      a.customerCode === customerCode
        ? {
            ...a,
            points: a.points + points,
            history: [
              { id: uid("lh"), type: "earn" as const, points, ref, at: new Date().toISOString() },
              ...a.history,
            ],
          }
        : a,
    ),
  );

  if (!isOperationsBackend()) return;

  persistInBackground(
    "pos-loyalty",
    async () => {
      const accounts = await loyaltyBridge.earnPointsRemote(customerCode, points, ref);
      applyCache(accounts);
    },
    () => {
      cache = previous;
    },
    emit,
  );
}

export function redeemPoints(customerCode: string, points: number, ref: string): boolean {
  const acct = cache.find((a) => a.customerCode === customerCode);
  if (!acct || acct.points < points) return false;

  const previous = cache;
  applyCache(
    cache.map((a) =>
      a.customerCode === customerCode
        ? {
            ...a,
            points: a.points - points,
            history: [
              { id: uid("lh"), type: "redeem" as const, points, ref, at: new Date().toISOString() },
              ...a.history,
            ],
          }
        : a,
    ),
  );

  if (!isOperationsBackend()) return true;

  let ok = true;
  persistInBackground(
    "pos-loyalty",
    async () => {
      const result = await loyaltyBridge.redeemPointsRemote(customerCode, points, ref);
      ok = result.ok;
      if (result.ok) {
        applyCache(result.accounts);
      } else {
        cache = previous;
        emit();
      }
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return ok;
}

export function tierForPoints(points: number): LoyaltyTier {
  if (points >= 5000) return "platinum";
  if (points >= 2500) return "gold";
  if (points >= 1000) return "silver";
  return "bronze";
}
