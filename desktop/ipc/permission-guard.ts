import type { IpcMainInvokeEvent } from "electron";

import type { PermissionKey } from "../services/permissions.types";
import {
  assertHrPayrollAccess,
  assertHrPayrollOrUserAdmin,
  assertTokenPermission,
} from "../services/permissions.service";

export type IpcAuthPayload = { token?: string | null };

export function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const t = (payload as IpcAuthPayload).token;
  return typeof t === "string" ? t : null;
}

export async function requireIpcPermission(
  _event: IpcMainInvokeEvent,
  payload: unknown,
  key: PermissionKey,
) {
  return assertTokenPermission(extractToken(payload), key);
}

export async function requireHrPayrollAccess(
  _event: IpcMainInvokeEvent,
  payload: unknown,
) {
  return assertHrPayrollAccess(extractToken(payload));
}

export async function requireHrPayrollOrUserAdmin(
  _event: IpcMainInvokeEvent,
  payload: unknown,
) {
  return assertHrPayrollOrUserAdmin(extractToken(payload));
}
