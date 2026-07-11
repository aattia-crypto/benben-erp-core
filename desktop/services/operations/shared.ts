import { randomBytes } from "node:crypto";

export const DEFAULT_ORG_ID = "default";

export function resolveOrgId(orgId?: string): string {
  const id = orgId?.trim();
  return id || DEFAULT_ORG_ID;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex").slice(0, 8)}`;
}

export function parseDate(value: string | undefined, fallback?: Date): Date {
  if (!value?.trim()) return fallback ?? new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
}

export function parseDateOnly(value: string | undefined): Date {
  const raw = value?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseDate(`${raw}T12:00:00.000Z`);
  }
  return parseDate(raw);
}

export function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseJsonArray<T>(raw: string | null | undefined, fallback: T[] = []): T[] {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function encodeJson<T>(value: T): string {
  return JSON.stringify(value);
}
