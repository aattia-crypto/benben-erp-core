import type { GoodsReceipt, PurchaseOrder, PurchaseOrderLine } from "@prisma/client";

import { getPrisma } from "../database";
import { newId, parseDate, parseDateOnly, resolveOrgId, toDateOnlyString } from "./shared";

export type POStatus = "draft" | "pending_approval" | "approved" | "denied" | "received" | "closed";

export type POLogAction = "created" | "submitted" | "approved" | "denied" | "received";

export type POLineDto = {
  sku: string;
  description: string;
  qty: number;
  unitCost: number;
};

export type PurchaseOrderDto = {
  id: string;
  poNumber: string;
  vendorCode: string;
  vendorName: string;
  status: POStatus;
  lines: POLineDto[];
  warehouseId: string;
  expectedDelivery: string;
  taxAmount: number;
  shippingAmount: number;
  notes?: string;
  createdAt: string;
  approvedAt?: string;
  deniedAt?: string;
  denialReason?: string;
  requestedByUserId?: string;
  requestedByName?: string;
};

export type POLogEntryDto = {
  id: string;
  poId: string;
  action: POLogAction;
  fromStatus?: POStatus;
  toStatus?: POStatus;
  actorUserId?: string;
  actorName?: string;
  comment?: string;
  createdAt: string;
};

export type GoodsReceiptDto = {
  id: string;
  poId: string;
  receivedAt: string;
  qty: number;
  sku: string;
};

export type PurchasingStateDto = {
  orders: PurchaseOrderDto[];
  receipts: GoodsReceiptDto[];
};

export type CreatePOInputDto = {
  poNumber?: string;
  vendorCode: string;
  vendorName: string;
  warehouseId: string;
  expectedDelivery: string;
  taxAmount: number;
  shippingAmount: number;
  notes?: string;
  status: POStatus;
  lines: POLineDto[];
  requestedByUserId?: string;
  requestedByName?: string;
};

export type PoActor = { userId?: string | null; name?: string | null };

function toOrderDto(row: PurchaseOrder & { lines: PurchaseOrderLine[] }): PurchaseOrderDto {
  return {
    id: row.id,
    poNumber: row.poNumber,
    vendorCode: row.vendorCode,
    vendorName: row.vendorName,
    status: row.status as POStatus,
    lines: row.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      unitCost: l.unitCost,
    })),
    warehouseId: row.warehouseId,
    expectedDelivery: toDateOnlyString(row.expectedDelivery),
    taxAmount: row.taxAmount,
    shippingAmount: row.shippingAmount,
    notes: row.notes ?? undefined,
    createdAt: toDateOnlyString(row.createdAt),
    approvedAt: row.approvedAt ? toDateOnlyString(row.approvedAt) : undefined,
    deniedAt: row.deniedAt ? toDateOnlyString(row.deniedAt) : undefined,
    denialReason: row.denialReason ?? undefined,
    requestedByUserId: row.requestedByUserId ?? undefined,
    requestedByName: row.requestedByName ?? undefined,
  };
}

function toLogDto(row: {
  id: string;
  poId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  actorName: string | null;
  comment: string | null;
  createdAt: Date;
}): POLogEntryDto {
  return {
    id: row.id,
    poId: row.poId,
    action: row.action as POLogAction,
    fromStatus: (row.fromStatus as POStatus | null) ?? undefined,
    toStatus: (row.toStatus as POStatus | null) ?? undefined,
    actorUserId: row.actorUserId ?? undefined,
    actorName: row.actorName ?? undefined,
    comment: row.comment ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

async function appendPoLog(
  orgId: string,
  poId: string,
  input: {
    action: POLogAction;
    fromStatus?: POStatus;
    toStatus?: POStatus;
    actor?: PoActor;
    comment?: string;
  },
): Promise<void> {
  const db = getPrisma();
  await db.purchaseOrderLog.create({
    data: {
      orgId,
      poId,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actorUserId: input.actor?.userId ?? null,
      actorName: input.actor?.name ?? null,
      comment: input.comment ?? null,
    },
  });
}

async function loadOrder(orgId: string, id: string): Promise<PurchaseOrder & { lines: PurchaseOrderLine[] }> {
  const db = getPrisma();
  const row = await db.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!row || row.orgId !== orgId) throw new Error("PO not found.");
  return row;
}

export async function getPurchasingState(orgId = resolveOrgId()): Promise<PurchasingStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [orders, receipts] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { orgId: org },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    }),
    db.goodsReceipt.findMany({ where: { orgId: org }, orderBy: { receivedAt: "desc" } }),
  ]);

  return {
    orders: orders.map(toOrderDto),
    receipts: receipts.map((r) => ({
      id: r.id,
      poId: r.poId,
      receivedAt: r.receivedAt.toISOString(),
      qty: r.qty,
      sku: r.sku,
    })),
  };
}

export async function getPoLogs(orgId: string, poId: string): Promise<POLogEntryDto[]> {
  const org = resolveOrgId(orgId);
  const db = getPrisma();
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, select: { orgId: true } });
  if (!po || po.orgId !== org) throw new Error("PO not found.");
  const rows = await db.purchaseOrderLog.findMany({
    where: { poId, orgId: org },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toLogDto);
}

export async function createPurchaseOrder(
  orgId: string,
  order: PurchaseOrderDto,
  actor?: PoActor,
): Promise<PurchaseOrderDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const count = await db.purchaseOrder.count({ where: { orgId: org } });
  const poNumber =
    order.poNumber?.trim() ||
    `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  const id = order.id || newId("po");
  const requester =
    order.status === "pending_approval"
      ? {
          requestedByUserId: order.requestedByUserId ?? actor?.userId ?? null,
          requestedByName: order.requestedByName ?? actor?.name ?? null,
        }
      : {
          requestedByUserId: order.requestedByUserId ?? null,
          requestedByName: order.requestedByName ?? null,
        };

  const row = await db.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        id,
        orgId: org,
        poNumber,
        vendorCode: order.vendorCode,
        vendorName: order.vendorName,
        status: order.status,
        warehouseId: order.warehouseId || "loc_wh_central",
        expectedDelivery: parseDateOnly(order.expectedDelivery),
        taxAmount: order.taxAmount,
        shippingAmount: order.shippingAmount,
        notes: order.notes ?? null,
        createdAt: parseDateOnly(order.createdAt || new Date().toISOString().slice(0, 10)),
        requestedByUserId: requester.requestedByUserId,
        requestedByName: requester.requestedByName,
      },
    });

    for (const line of order.lines) {
      await tx.purchaseOrderLine.create({
        data: {
          orgId: org,
          poId: created.id,
          sku: line.sku,
          description: line.description,
          qty: line.qty,
          unitCost: line.unitCost,
        },
      });
    }

    await tx.purchaseOrderLog.create({
      data: {
        orgId: org,
        poId: created.id,
        action: "created",
        fromStatus: null,
        toStatus: order.status,
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        comment: order.status === "pending_approval" ? "Submitted for finance approval" : "Draft created",
      },
    });

    if (order.status === "pending_approval") {
      await tx.purchaseOrderLog.create({
        data: {
          orgId: org,
          poId: created.id,
          action: "submitted",
          fromStatus: "draft",
          toStatus: "pending_approval",
          actorUserId: requester.requestedByUserId,
          actorName: requester.requestedByName,
          comment: "Awaiting finance department review",
        },
      });
    }

    return tx.purchaseOrder.findUnique({
      where: { id: created.id },
      include: { lines: true },
    });
  });

  if (!row) throw new Error("PO create failed.");
  return toOrderDto(row);
}

export async function submitPOForApproval(
  orgId: string,
  id: string,
  actor?: PoActor,
): Promise<PurchaseOrderDto> {
  const org = resolveOrgId(orgId);
  const existing = await loadOrder(org, id);
  if (existing.status !== "draft") {
    throw new Error(`Only draft POs can be submitted (current: ${existing.status}).`);
  }

  const db = getPrisma();
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "pending_approval",
        requestedByUserId: actor?.userId ?? existing.requestedByUserId,
        requestedByName: actor?.name ?? existing.requestedByName,
        deniedAt: null,
        denialReason: null,
      },
      include: { lines: true },
    });

    await tx.purchaseOrderLog.create({
      data: {
        orgId: org,
        poId: id,
        action: "submitted",
        fromStatus: "draft",
        toStatus: "pending_approval",
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        comment: "Submitted to finance for approval",
      },
    });

    return updated;
  });

  return toOrderDto(row);
}

export async function approvePO(orgId: string, id: string, actor?: PoActor): Promise<PurchaseOrderDto> {
  const org = resolveOrgId(orgId);
  const existing = await loadOrder(org, id);
  if (existing.status !== "pending_approval") {
    throw new Error(`Only POs pending finance approval can be approved (current: ${existing.status}).`);
  }

  const db = getPrisma();
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: parseDateOnly(new Date().toISOString().slice(0, 10)),
        deniedAt: null,
        denialReason: null,
      },
      include: { lines: true },
    });

    await tx.purchaseOrderLog.create({
      data: {
        orgId: org,
        poId: id,
        action: "approved",
        fromStatus: "pending_approval",
        toStatus: "approved",
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        comment: "Approved by finance",
      },
    });

    return updated;
  });

  return toOrderDto(row);
}

export async function denyPO(
  orgId: string,
  id: string,
  reason: string,
  actor?: PoActor,
): Promise<PurchaseOrderDto> {
  const org = resolveOrgId(orgId);
  const existing = await loadOrder(org, id);
  if (existing.status !== "pending_approval") {
    throw new Error(`Only POs pending finance approval can be denied (current: ${existing.status}).`);
  }
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A denial reason is required.");

  const db = getPrisma();
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: "denied",
        deniedAt: parseDateOnly(new Date().toISOString().slice(0, 10)),
        denialReason: trimmed,
        approvedAt: null,
      },
      include: { lines: true },
    });

    await tx.purchaseOrderLog.create({
      data: {
        orgId: org,
        poId: id,
        action: "denied",
        fromStatus: "pending_approval",
        toStatus: "denied",
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        comment: trimmed,
      },
    });

    return updated;
  });

  return toOrderDto(row);
}

export async function receivePO(
  orgId: string,
  id: string,
  sku: string,
  qty: number,
  actor?: PoActor,
): Promise<{ receipt: GoodsReceiptDto; order: PurchaseOrderDto }> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await loadOrder(org, id);
  if (existing.status !== "approved") {
    throw new Error(`Only approved POs can be received (current: ${existing.status}).`);
  }

  return db.$transaction(async (tx) => {
    const receipt = await tx.goodsReceipt.create({
      data: {
        id: newId("gr"),
        orgId: org,
        poId: id,
        sku,
        qty,
        receivedAt: new Date(),
      },
    });

    const order = await tx.purchaseOrder.update({
      where: { id },
      data: { status: "received" },
      include: { lines: true },
    });

    await tx.purchaseOrderLog.create({
      data: {
        orgId: org,
        poId: id,
        action: "received",
        fromStatus: "approved",
        toStatus: "received",
        actorUserId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        comment: `Received ${qty} × ${sku}`,
      },
    });

    return {
      receipt: {
        id: receipt.id,
        poId: receipt.poId,
        receivedAt: receipt.receivedAt.toISOString(),
        qty: receipt.qty,
        sku: receipt.sku,
      },
      order: toOrderDto(order),
    };
  });
}
