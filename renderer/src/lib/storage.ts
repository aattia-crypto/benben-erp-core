/** Typed localStorage persistence with change subscriptions. */

import { randomUUID } from "./uuid";

const listeners = new Map<string, Set<() => void>>();
const LEGACY_KEY_PREFIX = "nexuscore.";

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  const direct = localStorage.getItem(key);
  if (direct) return direct;
  if (key.startsWith("benben.")) {
    return localStorage.getItem(key.replace(/^benben\./, LEGACY_KEY_PREFIX));
  }
  return null;
}

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = readRaw(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  emit(key);
}

export function subscribeStorage(key: string, fn: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(fn);
  return () => listeners.get(key)?.delete(fn);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}
