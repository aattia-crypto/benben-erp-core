import { readStorage, writeStorage } from "./storage";
import { randomUUID } from "./uuid";

const KEY = "benben.error.log.v1";
const MAX = 50;

export type ClientErrorEntry = {
  id: string;
  at: string;
  category: string;
  message: string;
  detail?: string;
};

export function logClientError(category: string, message: string, detail?: Record<string, unknown>): void {
  const prev = readStorage<ClientErrorEntry[]>(KEY, []);
  const entry: ClientErrorEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    category,
    message,
    detail: detail ? JSON.stringify(detail) : undefined,
  };
  writeStorage(KEY, [entry, ...prev].slice(0, MAX));
}

export function getClientErrors(): ClientErrorEntry[] {
  return readStorage<ClientErrorEntry[]>(KEY, []);
}

export function clearClientErrors(): void {
  writeStorage(KEY, []);
}
