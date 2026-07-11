import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as inventoryService from "../services/operations/inventory.service";
import * as locationService from "../services/operations/location.service";
import type {
  AdjustStockInput,
  ItemInputDto,
  LocationInputDto,
  WeightedCostAllocation,
} from "../services/operations/types";
import { assertTokenPermission } from "../services/permissions.service";
import type { PermissionKey } from "../services/permissions.types";
import { logger } from "../utils/logger";
import { logIpcActivity } from "./audit-context";
import { extractToken } from "./permission-guard";
import { registerOperationsModulesIpc } from "./operations-modules.ipc";

type AuthPayload = { token?: string; orgId?: string };

function ipcError(channel: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("Operations IPC handler failed", {
    channel,
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });
  return { ok: false as const, error: message };
}

function resolveOrgId(payload: AuthPayload): string {
  return payload.orgId?.trim() || "default";
}

async function requireInventoryRead(_event: IpcMainInvokeEvent, payload: AuthPayload) {
  const token = extractToken(payload);
  const keys: PermissionKey[] = [
    "view_inventory",
    "view_operations",
    "modify_inventory",
    "manage_users",
  ];
  for (const key of keys) {
    try {
      return await assertTokenPermission(token, key);
    } catch {
      // try next permission
    }
  }
  throw new Error("Permission denied: view_inventory");
}

async function requireInventoryWrite(_event: IpcMainInvokeEvent, payload: AuthPayload) {
  const token = extractToken(payload);
  try {
    return await assertTokenPermission(token, "modify_inventory");
  } catch {
    return assertTokenPermission(token, "manage_users");
  }
}

export function registerOperationsIpc(): void {
  registerOperationsModulesIpc();

  ipcMain.handle(IPC.operations.inventory.list, async (event, payload: AuthPayload) => {
    try {
      await requireInventoryRead(event, payload);
      const data = await inventoryService.listInventoryItems(resolveOrgId(payload));
      return { ok: true, data };
    } catch (err) {
      return ipcError(IPC.operations.inventory.list, err);
    }
  });

  ipcMain.handle(
    IPC.operations.inventory.listMovements,
    async (event, payload: AuthPayload & { sku?: string }) => {
      try {
        await requireInventoryRead(event, payload);
        const data = await inventoryService.listMovements(resolveOrgId(payload), payload.sku);
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.inventory.listMovements, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.inventory.findByScan,
    async (event, payload: AuthPayload & { code: string }) => {
      try {
        await requireInventoryRead(event, payload);
        const data = await inventoryService.findItemByScan(resolveOrgId(payload), payload.code);
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.inventory.findByScan, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.inventory.create,
    async (event, payload: AuthPayload & { input: ItemInputDto }) => {
      try {
        await requireInventoryWrite(event, payload);
        const data = await inventoryService.createInventoryItem(resolveOrgId(payload), payload.input);
        await logIpcActivity(event, payload, {
          module: "INVENTORY",
          action: "ITEM_CREATED",
          entityType: "InventoryItem",
          entityId: data.id,
          summary: `${data.sku} · ${data.name}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.inventory.create, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.inventory.update,
    async (event, payload: AuthPayload & { id: string; patch: Partial<ItemInputDto> }) => {
      try {
        await requireInventoryWrite(event, payload);
        const data = await inventoryService.updateInventoryItem(
          resolveOrgId(payload),
          payload.id,
          payload.patch,
        );
        await logIpcActivity(event, payload, {
          module: "INVENTORY",
          action: "ITEM_UPDATED",
          entityType: "InventoryItem",
          entityId: data.id,
          summary: `${data.sku} · ${data.name}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.inventory.update, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.inventory.delete,
    async (event, payload: AuthPayload & { id: string }) => {
      try {
        await requireInventoryWrite(event, payload);
        const deleted = await inventoryService.deleteInventoryItem(resolveOrgId(payload), payload.id);
        if (deleted) {
          await logIpcActivity(event, payload, {
            module: "INVENTORY",
            action: "ITEM_DELETED",
            entityType: "InventoryItem",
            entityId: payload.id,
            summary: `Deleted inventory item ${payload.id}`,
          });
        }
        return { ok: true, data: { deleted } };
      } catch (err) {
        return ipcError(IPC.operations.inventory.delete, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.inventory.adjustStock,
    async (event, payload: AuthPayload & AdjustStockInput) => {
      try {
        await requireInventoryWrite(event, payload);
        const { token: _t, orgId: _o, ...input } = payload;
        const data = await inventoryService.adjustInventoryStock(resolveOrgId(payload), input);
        await logIpcActivity(event, payload, {
          module: "INVENTORY",
          action: "STOCK_ADJUSTED",
          entityType: "InventoryItem",
          entityId: data.item?.id ?? payload.sku,
          summary: `${payload.type} ${payload.qty} × ${payload.sku}`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.inventory.adjustStock, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.inventory.applyWeightedCosts,
    async (
      event,
      payload: AuthPayload & { allocations: WeightedCostAllocation[]; reason: string },
    ) => {
      try {
        await requireInventoryWrite(event, payload);
        const data = await inventoryService.applyWeightedUnitCosts(
          resolveOrgId(payload),
          payload.allocations,
          payload.reason,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.inventory.applyWeightedCosts, err);
      }
    },
  );

  ipcMain.handle(IPC.operations.inventory.valuation, async (event, payload: AuthPayload) => {
    try {
      await requireInventoryRead(event, payload);
      const total = await inventoryService.getStockValuation(resolveOrgId(payload));
      return { ok: true, data: { total } };
    } catch (err) {
      return ipcError(IPC.operations.inventory.valuation, err);
    }
  });

  ipcMain.handle(
    IPC.operations.location.list,
    async (event, payload: AuthPayload & { includeArchived?: boolean }) => {
      try {
        await requireInventoryRead(event, payload);
        const data = await locationService.listLocations(
          resolveOrgId(payload),
          payload.includeArchived ?? false,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.location.list, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.location.get,
    async (event, payload: AuthPayload & { id: string }) => {
      try {
        await requireInventoryRead(event, payload);
        const data = await locationService.getLocationById(resolveOrgId(payload), payload.id);
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.location.get, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.location.create,
    async (event, payload: AuthPayload & { input: LocationInputDto }) => {
      try {
        await requireInventoryWrite(event, payload);
        const data = await locationService.createLocation(resolveOrgId(payload), payload.input);
        await logIpcActivity(event, payload, {
          module: "LOCATIONS",
          action: "LOCATION_CREATED",
          entityType: "StockLocation",
          entityId: data.id,
          summary: `${data.label} (${data.kind})`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.location.create, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.location.update,
    async (
      event,
      payload: AuthPayload & { id: string; patch: Partial<LocationInputDto & { active: boolean }> },
    ) => {
      try {
        await requireInventoryWrite(event, payload);
        const data = await locationService.updateLocation(
          resolveOrgId(payload),
          payload.id,
          payload.patch,
        );
        await logIpcActivity(event, payload, {
          module: "LOCATIONS",
          action: "LOCATION_UPDATED",
          entityType: "StockLocation",
          entityId: data.id,
          summary: `${data.label} (${data.kind})`,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.location.update, err);
      }
    },
  );

  ipcMain.handle(
    IPC.operations.location.archive,
    async (event, payload: AuthPayload & { id: string }) => {
      try {
        await requireInventoryWrite(event, payload);
        const data = await locationService.archiveLocation(resolveOrgId(payload), payload.id);
        await logIpcActivity(event, payload, {
          module: "LOCATIONS",
          action: "LOCATION_ARCHIVED",
          entityType: "StockLocation",
          entityId: data.id,
          summary: data.label,
        });
        return { ok: true, data };
      } catch (err) {
        return ipcError(IPC.operations.location.archive, err);
      }
    },
  );
}
