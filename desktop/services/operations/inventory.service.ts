import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { getPrisma } from "../database";
import {
  DEFAULT_ORG_ID,
  type AdjustStockInput,
  type InventoryItemDto,
  type InventoryMovementDto,
  type ItemInputDto,
  type WeightedCostAllocation,
  toInventoryItemDto,
  toInventoryMovementDto,
} from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

function newInventoryId(): string {
  return `inv_${randomBytes(4).toString("hex").slice(0, 8)}`;
}

function newMovementId(): string {
  return `mv_${randomBytes(4).toString("hex").slice(0, 8)}`;
}

function resolveOrgId(orgId?: string): string {
  const id = orgId?.trim();
  return id || DEFAULT_ORG_ID;
}

export async function listInventoryItems(orgId = DEFAULT_ORG_ID): Promise<InventoryItemDto[]> {
  const db = getPrisma();
  const rows = await db.inventoryItem.findMany({
    where: { orgId: resolveOrgId(orgId) },
    orderBy: { sku: "asc" },
  });
  return rows.map(toInventoryItemDto);
}

export async function listMovements(
  orgId = DEFAULT_ORG_ID,
  sku?: string,
): Promise<InventoryMovementDto[]> {
  const db = getPrisma();
  const where: Prisma.InventoryMovementWhereInput = { orgId: resolveOrgId(orgId) };
  if (sku?.trim()) where.sku = sku.trim();
  const rows = await db.inventoryMovement.findMany({
    where,
    orderBy: { occurredAt: "desc" },
  });
  return rows.map(toInventoryMovementDto);
}

export async function findItemByScan(
  orgId = DEFAULT_ORG_ID,
  code: string,
): Promise<InventoryItemDto | null> {
  const q = code.trim().toUpperCase();
  if (!q) return null;

  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const items = await db.inventoryItem.findMany({ where: { orgId: org } });

  const match = items.find(
    (i) =>
      i.sku.toUpperCase() === q ||
      i.barcode?.toUpperCase() === q ||
      i.qrCode?.toUpperCase() === q ||
      i.barcode?.toUpperCase() === `BC-${q}` ||
      i.qrCode?.toUpperCase() === `QR-${q}`,
  );
  return match ? toInventoryItemDto(match) : null;
}

export async function createInventoryItem(
  orgId = DEFAULT_ORG_ID,
  input: ItemInputDto,
): Promise<InventoryItemDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const sku = input.sku.trim();
  if (!sku) throw new Error("SKU is required.");

  const existing = await db.inventoryItem.findUnique({
    where: { orgId_sku: { orgId: org, sku } },
  });
  if (existing) throw new Error(`SKU already exists: ${sku}`);

  const row = await db.inventoryItem.create({
    data: {
      id: newInventoryId(),
      orgId: org,
      sku,
      name: input.name.trim() || sku,
      category: input.category.trim() || "General",
      uom: input.uom.trim() || "ea",
      onHand: Number(input.onHand) || 0,
      reorderLevel: Number(input.reorderLevel) || 0,
      unitCost: Number(input.unitCost) || 0,
      warehouse: input.warehouse.trim() || "Main",
      binLocation: input.location.trim() || "",
      barcode: input.barcode?.trim() || null,
      qrCode: input.qrCode?.trim() || null,
      status: input.status === "discontinued" ? "discontinued" : "active",
    },
  });
  return toInventoryItemDto(row);
}

export async function updateInventoryItem(
  orgId = DEFAULT_ORG_ID,
  id: string,
  patch: Partial<ItemInputDto>,
): Promise<InventoryItemDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.inventoryItem.findFirst({ where: { id, orgId: org } });
  if (!existing) throw new Error("Inventory item not found.");

  if (patch.sku && patch.sku.trim() !== existing.sku) {
    const conflict = await db.inventoryItem.findUnique({
      where: { orgId_sku: { orgId: org, sku: patch.sku.trim() } },
    });
    if (conflict) throw new Error(`SKU already exists: ${patch.sku}`);
  }

  const data: Prisma.InventoryItemUpdateInput = {};
  if (patch.sku !== undefined) data.sku = patch.sku.trim();
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.category !== undefined) data.category = patch.category.trim();
  if (patch.uom !== undefined) data.uom = patch.uom.trim();
  if (patch.onHand !== undefined) data.onHand = Number(patch.onHand);
  if (patch.reorderLevel !== undefined) data.reorderLevel = Number(patch.reorderLevel);
  if (patch.unitCost !== undefined) data.unitCost = Number(patch.unitCost);
  if (patch.warehouse !== undefined) data.warehouse = patch.warehouse.trim();
  if (patch.location !== undefined) data.binLocation = patch.location.trim();
  if (patch.barcode !== undefined) data.barcode = patch.barcode?.trim() || null;
  if (patch.qrCode !== undefined) data.qrCode = patch.qrCode?.trim() || null;
  if (patch.status !== undefined) {
    data.status = patch.status === "discontinued" ? "discontinued" : "active";
  }

  const row = await db.inventoryItem.update({ where: { id }, data });
  return toInventoryItemDto(row);
}

export async function deleteInventoryItem(orgId = DEFAULT_ORG_ID, id: string): Promise<boolean> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.inventoryItem.findFirst({ where: { id, orgId: org } });
  if (!existing) return false;
  await db.inventoryItem.delete({ where: { id } });
  return true;
}

export async function adjustInventoryStock(
  orgId = DEFAULT_ORG_ID,
  input: AdjustStockInput,
): Promise<{ item: InventoryItemDto | null; movement: InventoryMovementDto }> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const sku = input.sku.trim();
  if (!sku) throw new Error("SKU is required.");

  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty < 0) throw new Error("Quantity must be zero or positive.");

  return db.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({ where: { orgId: org, sku } });
    const warehouse = item?.warehouse ?? "Main";
    const delta = input.type === "issue" ? -qty : qty;
    let updatedItem: InventoryItemDto | null = null;

    if (item) {
      const newOnHand = Math.max(0, item.onHand + delta);
      const row = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { onHand: newOnHand },
      });
      updatedItem = toInventoryItemDto(row);
    }

    const movementRow = await tx.inventoryMovement.create({
      data: {
        id: newMovementId(),
        orgId: org,
        itemId: item?.id ?? null,
        sku,
        type: input.type,
        qty,
        reason: input.reason.trim() || "Stock adjustment",
        warehouse,
        occurredAt: new Date(),
      },
    });

    return {
      item: updatedItem,
      movement: toInventoryMovementDto(movementRow),
    };
  });
}

export async function applyWeightedUnitCosts(
  orgId = DEFAULT_ORG_ID,
  allocations: WeightedCostAllocation[],
  reason: string,
): Promise<InventoryItemDto[]> {
  if (!allocations.length) return [];

  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const trimmedReason = reason.trim() || "Landed cost allocation";

  return db.$transaction(async (tx) => {
    const updated: InventoryItemDto[] = [];

    for (const alloc of allocations) {
      const sku = alloc.sku.trim();
      if (!sku) continue;

      const item = await tx.inventoryItem.findFirst({ where: { orgId: org, sku } });
      if (!item) continue;

      const weightQty = Math.max(item.onHand, 1);
      const landedUnitCost = Number(alloc.landedUnitCost);
      const newCost = ROUND(
        (item.onHand * item.unitCost + weightQty * landedUnitCost) / (item.onHand + weightQty),
      );

      const row = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { unitCost: newCost },
      });

      await tx.inventoryMovement.create({
        data: {
          id: newMovementId(),
          orgId: org,
          itemId: item.id,
          sku,
          type: "adjust",
          qty: 0,
          reason: `${trimmedReason} → $${landedUnitCost}/unit`,
          warehouse: item.warehouse,
          occurredAt: new Date(),
        },
      });

      updated.push(toInventoryItemDto(row));
    }

    return updated;
  });
}

export async function getStockValuation(orgId = DEFAULT_ORG_ID): Promise<number> {
  const items = await listInventoryItems(orgId);
  return ROUND(items.reduce((sum, item) => sum + item.onHand * item.unitCost, 0));
}
