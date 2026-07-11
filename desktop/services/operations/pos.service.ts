import type { LoyaltyAccount, LoyaltyTransaction, PosOfflineQueue, PosSale, PosSaleLine } from "@prisma/client";

import { getPrisma } from "../database";
import { encodeJson, newId, parseDate, parseJsonArray, resolveOrgId } from "./shared";

export type CartLineDto = {
  sku: string;
  name: string;
  price: number;
  qty: number;
};

export type SaleStatus = "queued" | "synced";

export type PosSaleDto = {
  id: string;
  ref: string;
  date: string;
  locationId: string;
  paymentMethod: "cash" | "ar" | "card";
  lines: CartLineDto[];
  subtotal: number;
  tax: number;
  total: number;
  status: SaleStatus;
  reversed?: boolean;
  taxExempt?: boolean;
  customerCode?: string;
  customerName?: string;
};

export type PosStateDto = {
  sales: PosSaleDto[];
  queue: string[];
};

export type OnlineOrderStatus =
  | "pending"
  | "confirmed"
  | "ready"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type OnlineOrderDto = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  lines: CartLineDto[];
  fulfillment: "pickup" | "delivery";
  status: OnlineOrderStatus;
  locationId: string;
  total: number;
  placedAt: string;
};

export type PosReturnDto = {
  id: string;
  saleRef: string;
  lines: { sku: string; qty: number }[];
  reason: string;
  refundMethod: "cash" | "card" | "store_credit";
  restocked: boolean;
  at: string;
};

export type VoidAuditDto = {
  id: string;
  saleRef: string;
  reason: string;
  managerPin?: string;
  at: string;
};

export type PosOpsStateDto = {
  onlineOrders: OnlineOrderDto[];
  returns: PosReturnDto[];
  voids: VoidAuditDto[];
};

function toSaleDto(row: PosSale & { lines: PosSaleLine[] }): PosSaleDto {
  return {
    id: row.id,
    ref: row.ref,
    date: row.soldAt.toISOString(),
    locationId: row.locationId,
    paymentMethod: row.paymentMethod as PosSaleDto["paymentMethod"],
    lines: row.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      price: l.price,
      qty: l.qty,
    })),
    subtotal: row.subtotal,
    tax: row.tax,
    total: row.total,
    status: row.status as SaleStatus,
    reversed: row.isReversed,
    taxExempt: row.taxExempt,
    customerCode: row.customerCode ?? undefined,
    customerName: row.customerName ?? undefined,
  };
}

export async function getPosState(orgId = resolveOrgId()): Promise<PosStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [sales, queueRows] = await Promise.all([
    db.posSale.findMany({
      where: { orgId: org },
      include: { lines: true },
      orderBy: { soldAt: "desc" },
    }),
    db.posOfflineQueue.findMany({ where: { orgId: org }, orderBy: { position: "asc" } }),
  ]);
  return {
    sales: sales.map(toSaleDto),
    queue: queueRows.map((q) => q.saleId),
  };
}

export async function savePosSale(orgId: string, sale: PosSaleDto): Promise<PosSaleDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);

  const row = await db.$transaction(async (tx) => {
    await tx.posSale.upsert({
      where: { id: sale.id },
      create: {
        id: sale.id,
        orgId: org,
        ref: sale.ref,
        soldAt: parseDate(sale.date),
        locationId: sale.locationId,
        paymentMethod: sale.paymentMethod,
        subtotal: sale.subtotal,
        tax: sale.tax,
        total: sale.total,
        status: sale.status,
        isReversed: sale.reversed ?? false,
        taxExempt: sale.taxExempt ?? false,
        customerCode: sale.customerCode ?? null,
        customerName: sale.customerName ?? null,
      },
      update: {
        status: sale.status,
        isReversed: sale.reversed ?? false,
        customerCode: sale.customerCode ?? null,
        customerName: sale.customerName ?? null,
      },
    });

    await tx.posSaleLine.deleteMany({ where: { saleId: sale.id } });
    for (const line of sale.lines) {
      await tx.posSaleLine.create({
        data: {
          saleId: sale.id,
          sku: line.sku,
          name: line.name,
          price: line.price,
          qty: line.qty,
        },
      });
    }

    if (sale.status === "queued") {
      const count = await tx.posOfflineQueue.count({ where: { orgId: org } });
      await tx.posOfflineQueue.upsert({
        where: { orgId_saleId: { orgId: org, saleId: sale.id } },
        create: { orgId: org, saleId: sale.id, position: count },
        update: {},
      });
    } else {
      await tx.posOfflineQueue.deleteMany({ where: { orgId: org, saleId: sale.id } });
    }

    const saved = await tx.posSale.findUnique({
      where: { id: sale.id },
      include: { lines: true },
    });
    if (!saved) throw new Error("POS sale save failed.");
    return saved;
  });

  return toSaleDto(row);
}

export async function reversePosSale(orgId: string, saleId: string): Promise<PosSaleDto | null> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const existing = await db.posSale.findFirst({ where: { id: saleId, orgId: org } });
  if (!existing || existing.isReversed) return null;

  const row = await db.posSale.update({
    where: { id: saleId },
    data: { isReversed: true },
    include: { lines: true },
  });
  return toSaleDto(row);
}

export async function flushPosQueue(orgId: string): Promise<{ count: number; sales: PosSaleDto[] }> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const queue = await db.posOfflineQueue.findMany({
    where: { orgId: org },
    orderBy: { position: "asc" },
  });
  if (!queue.length) return { count: 0, sales: [] };

  const updated: PosSaleDto[] = [];
  await db.$transaction(async (tx) => {
    for (const q of queue) {
      const sale = await tx.posSale.update({
        where: { id: q.saleId },
        data: { status: "synced" },
        include: { lines: true },
      });
      updated.push(toSaleDto(sale));
    }
    await tx.posOfflineQueue.deleteMany({ where: { orgId: org } });
  });

  return { count: updated.length, sales: updated };
}

export async function clearPosTransactionData(orgId: string): Promise<void> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  await db.$transaction(async (tx) => {
    await tx.posOfflineQueue.deleteMany({ where: { orgId: org } });
    const sales = await tx.posSale.findMany({ where: { orgId: org }, select: { id: true } });
    for (const s of sales) {
      await tx.posSaleLine.deleteMany({ where: { saleId: s.id } });
    }
    await tx.posSale.deleteMany({ where: { orgId: org } });
  });
}

export async function getPosOpsState(orgId = resolveOrgId()): Promise<PosOpsStateDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const [onlineOrders, returns, voids] = await Promise.all([
    db.posOnlineOrder.findMany({ where: { orgId: org }, orderBy: { placedAt: "desc" } }),
    db.posReturn.findMany({ where: { orgId: org }, orderBy: { returnedAt: "desc" } }),
    db.posVoidAudit.findMany({ where: { orgId: org }, orderBy: { voidedAt: "desc" } }),
  ]);

  return {
    onlineOrders: onlineOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerEmail: o.customerEmail ?? undefined,
      lines: parseJsonArray<CartLineDto>(o.linesJson),
      fulfillment: o.fulfillment as OnlineOrderDto["fulfillment"],
      status: o.status as OnlineOrderStatus,
      locationId: o.locationId,
      total: o.total,
      placedAt: o.placedAt.toISOString(),
    })),
    returns: returns.map((r) => ({
      id: r.id,
      saleRef: r.saleRef,
      lines: parseJsonArray<{ sku: string; qty: number }>(r.linesJson),
      reason: r.reason,
      refundMethod: r.refundMethod as PosReturnDto["refundMethod"],
      restocked: r.restocked,
      at: r.returnedAt.toISOString(),
    })),
    voids: voids.map((v) => ({
      id: v.id,
      saleRef: v.saleRef,
      reason: v.reason,
      managerPin: v.managerPin ?? undefined,
      at: v.voidedAt.toISOString(),
    })),
  };
}

export async function createOnlineOrder(
  orgId: string,
  input: Omit<OnlineOrderDto, "id" | "orderNumber" | "placedAt" | "status">,
): Promise<OnlineOrderDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const count = await db.posOnlineOrder.count({ where: { orgId: org } });
  const row = await db.posOnlineOrder.create({
    data: {
      id: newId("oo"),
      orgId: org,
      orderNumber: `WEB-${String(count + 1).padStart(5, "0")}`,
      customerName: input.customerName,
      customerEmail: input.customerEmail ?? null,
      fulfillment: input.fulfillment,
      status: "pending",
      locationId: input.locationId,
      total: input.total,
      placedAt: new Date(),
      linesJson: encodeJson(input.lines),
    },
  });

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    customerEmail: row.customerEmail ?? undefined,
    lines: input.lines,
    fulfillment: row.fulfillment as OnlineOrderDto["fulfillment"],
    status: "pending",
    locationId: row.locationId,
    total: row.total,
    placedAt: row.placedAt.toISOString(),
  };
}

export async function updateOnlineOrderStatus(
  orgId: string,
  id: string,
  status: OnlineOrderStatus,
): Promise<OnlineOrderDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.posOnlineOrder.update({ where: { id }, data: { status } });
  if (row.orgId !== org) throw new Error("Order not found.");
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    customerEmail: row.customerEmail ?? undefined,
    lines: parseJsonArray<CartLineDto>(row.linesJson),
    fulfillment: row.fulfillment as OnlineOrderDto["fulfillment"],
    status: row.status as OnlineOrderStatus,
    locationId: row.locationId,
    total: row.total,
    placedAt: row.placedAt.toISOString(),
  };
}

export async function recordReturn(
  orgId: string,
  saleRef: string,
  lines: { sku: string; qty: number }[],
  reason: string,
  refundMethod: PosReturnDto["refundMethod"],
  restocked: boolean,
): Promise<PosReturnDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.posReturn.create({
    data: {
      id: newId("ret"),
      orgId: org,
      saleRef,
      reason,
      refundMethod,
      restocked,
      linesJson: encodeJson(lines),
      returnedAt: new Date(),
    },
  });
  return {
    id: row.id,
    saleRef: row.saleRef,
    lines,
    reason: row.reason,
    refundMethod: row.refundMethod as PosReturnDto["refundMethod"],
    restocked: row.restocked,
    at: row.returnedAt.toISOString(),
  };
}

export async function recordVoid(
  orgId: string,
  saleRef: string,
  reason: string,
  managerPin?: string,
): Promise<VoidAuditDto> {
  const db = getPrisma();
  const org = resolveOrgId(orgId);
  const row = await db.posVoidAudit.create({
    data: {
      id: newId("void"),
      orgId: org,
      saleRef,
      reason,
      managerPin: managerPin ?? null,
      voidedAt: new Date(),
    },
  });
  return {
    id: row.id,
    saleRef: row.saleRef,
    reason: row.reason,
    managerPin: row.managerPin ?? undefined,
    at: row.voidedAt.toISOString(),
  };
}
