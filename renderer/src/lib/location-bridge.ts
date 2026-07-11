/**
 * Desktop IPC bridge for stock locations (window.benben.operations.location).
 */
import { isDesktopShell } from "./desktop-api";
import type { LocationInput, StockLocation } from "./location-store";

type IpcOk<T> = { ok: true; data: T };
type IpcErr = { ok: false; error: string };

function locationApi() {
  const api = window.benben?.operations?.location;
  if (!api) throw new Error("Locations module requires the Benben desktop app.");
  return api;
}

function unwrap<T>(res: IpcOk<T> | IpcErr): T {
  if (!res.ok) throw new Error(res.error || "Request failed.");
  return res.data;
}

export function isLocationBackend(): boolean {
  return isDesktopShell() && !!window.benben?.operations?.location;
}

export async function fetchLocations(includeArchived = false): Promise<StockLocation[]> {
  return unwrap(await locationApi().list(includeArchived));
}

export async function fetchLocationById(id: string): Promise<StockLocation | null> {
  return unwrap(await locationApi().get(id));
}

export async function createLocationRemote(input: LocationInput): Promise<StockLocation> {
  return unwrap(await locationApi().create(input));
}

export async function updateLocationRemote(
  id: string,
  patch: Partial<LocationInput & { active: boolean }>,
): Promise<StockLocation> {
  return unwrap(await locationApi().update(id, patch));
}

export async function archiveLocationRemote(id: string): Promise<StockLocation> {
  return unwrap(await locationApi().archive(id));
}
