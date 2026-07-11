import { readStorage, subscribeStorage, uid, writeStorage } from "../storage";
import type { ImportHistoryEntry } from "./types";

const KEY = "benben.data_import.history.v1";

function load(): ImportHistoryEntry[] {
  return readStorage(KEY, []);
}

let cache = load();

export function subscribeImportHistory(fn: () => void) {
  return subscribeStorage(KEY, fn);
}

export function getImportHistory(): ImportHistoryEntry[] {
  return cache;
}

export function appendImportHistory(
  entry: Omit<ImportHistoryEntry, "id" | "at">,
): ImportHistoryEntry {
  const full: ImportHistoryEntry = {
    ...entry,
    id: uid("imp"),
    at: new Date().toISOString(),
  };
  cache = [full, ...cache].slice(0, 100);
  writeStorage(KEY, cache);
  return full;
}
