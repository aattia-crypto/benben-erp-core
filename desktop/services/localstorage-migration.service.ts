/**
 * One-time localStorage → PostgreSQL migration (operations modules Waves 1–3).
 * Finance localStorage is imported only when respective PG tables are empty.
 */
import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { getPrisma } from "./database";
import { ORG_DEFAULT } from "./finance/types";
import { logger } from "../utils/logger";
import {
  LOCALSTORAGE_MIGRATION_KEY,
  type LocalStorageMigrationSnapshot,
  type MigrationImportResult,
  type MigrationModuleCounts,
  type MigrationStatusDto,
} from "./localstorage-migration.types";

const ALL_OPERATIONAL_MODULE_KEYS: (keyof MigrationModuleCounts)[] = [
  "stockLocations",
  "inventoryItems",
  "inventoryMovements",
  "boms",
  "productionBatches",
  "purchaseOrders",
  "salesQuotes",
  "importShipments",
  "posSales",
  "loyaltyAccounts",
  "crmOpportunities",
  "crmParties",
  "dataImportHistory",
];

function normalizeModuleCounts(counts: MigrationModuleCounts): MigrationModuleCounts {
  const normalized: MigrationModuleCounts = {};
  for (const key of ALL_OPERATIONAL_MODULE_KEYS) {
    normalized[key] = counts[key] ?? 0;
  }
  for (const [key, value] of Object.entries(counts)) {
    if (value !== undefined) normalized[key as keyof MigrationModuleCounts] = value;
  }
  return normalized;
}

function parseDate(value: string | undefined, fallback?: Date): Date {
  if (!value?.trim()) return fallback ?? new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
}

function parseDateOnly(value: string | undefined): Date {
  const raw = value?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseDate(`${raw}T12:00:00.000Z`);
  }
  return parseDate(raw);
}

function hasOperationalPayload(snapshot: LocalStorageMigrationSnapshot): boolean {
  const m = snapshot.modules;
  if (m.inventory?.items?.length) return true;
  if (m.locations?.length) return true;
  if (m.manufacturing?.batches?.length || m.manufacturing?.boms?.length) return true;
  if (m.purchasing?.orders?.length) return true;
  if (m.sales?.quotes?.length || m.sales?.orders?.length || m.sales?.invoices?.length) return true;
  if (m.crm?.entities?.length) return true;
  if (m.crmPipeline?.opportunities?.length || m.crmPipeline?.tasks?.length) return true;
  if (m.imports?.shipments?.length) return true;
  if (m.pos?.sales?.length) return true;
  if (m.posOps?.onlineOrders?.length || m.posOps?.returns?.length) return true;
  if (m.posLoyalty?.length) return true;
  if (m.dataImportHistory?.length) return true;
  if (m.finance?.ar?.invoices?.length) return true;
  if (m.finance?.ap?.bills?.length) return true;
  if (m.finance?.gl?.accounts?.length) return true;
  return false;
}

export async function getLocalStorageMigrationStatus(
  orgId = ORG_DEFAULT,
): Promise<MigrationStatusDto> {
  const db = getPrisma();
  const run = await db.dataMigrationRun.findUnique({
    where: { orgId_migrationKey: { orgId, migrationKey: LOCALSTORAGE_MIGRATION_KEY } },
  });

  let moduleCounts: MigrationModuleCounts | null = null;
  if (run?.moduleCounts) {
    try {
      moduleCounts = JSON.parse(run.moduleCounts) as MigrationModuleCounts;
    } catch {
      moduleCounts = null;
    }
  }

  const completed = run?.status === "COMPLETED" || run?.status === "SKIPPED";

  return {
    migrationKey: LOCALSTORAGE_MIGRATION_KEY,
    required: !completed,
    completed,
    status: run?.status ?? null,
    completedAt: run?.completedAt?.toISOString() ?? null,
    moduleCounts,
    errorDetail: run?.errorDetail ?? null,
  };
}

async function markMigrationRun(
  orgId: string,
  patch: {
    status: string;
    sourceChecksum?: string;
    moduleCounts?: MigrationModuleCounts;
    errorDetail?: string | null;
    completed?: boolean;
  },
): Promise<void> {
  const db = getPrisma();
  const now = new Date();
  await db.dataMigrationRun.upsert({
    where: { orgId_migrationKey: { orgId, migrationKey: LOCALSTORAGE_MIGRATION_KEY } },
    create: {
      orgId,
      migrationKey: LOCALSTORAGE_MIGRATION_KEY,
      status: patch.status,
      sourceChecksum: patch.sourceChecksum ?? null,
      moduleCounts: patch.moduleCounts ? JSON.stringify(patch.moduleCounts) : null,
      errorDetail: patch.errorDetail ?? null,
      completedAt: patch.completed ? now : null,
    },
    update: {
      status: patch.status,
      sourceChecksum: patch.sourceChecksum ?? undefined,
      moduleCounts: patch.moduleCounts ? JSON.stringify(patch.moduleCounts) : undefined,
      errorDetail: patch.errorDetail ?? null,
      completedAt: patch.completed ? now : undefined,
      startedAt: patch.status === "RUNNING" ? now : undefined,
    },
  });
}

type Tx = Prisma.TransactionClient;

async function importFinanceIfEmpty(
  tx: Tx,
  orgId: string,
  snapshot: LocalStorageMigrationSnapshot,
): Promise<MigrationModuleCounts> {
  const counts: MigrationModuleCounts = {};
  const finance = snapshot.modules.finance;
  if (!finance) return counts;

  const glCount = await tx.glAccount.count({ where: { orgId } });
  if (glCount === 0 && finance.gl?.accounts?.length) {
    for (const a of finance.gl.accounts) {
      await tx.glAccount.create({
        data: {
          orgId,
          code: a.code,
          name: a.name,
          type: a.type.toUpperCase(),
        },
      });
    }
    for (const entry of finance.gl.journal ?? []) {
      if (!entry.posted) continue;
      const je = await tx.glJournalEntry.create({
        data: {
          orgId,
          entryDate: parseDateOnly(entry.date),
          reference: entry.ref,
          memo: entry.memo,
          source: entry.source.toUpperCase(),
          status: "POSTED",
        },
      });
      for (const line of entry.lines) {
        await tx.glJournalLine.create({
          data: {
            orgId,
            journalEntryId: je.id,
            accountCode: line.account,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
          },
        });
      }
    }
    counts.glAccounts = finance.gl.accounts.length;
    counts.glJournalEntries = finance.gl.journal?.length ?? 0;
  }

  const arCount = await tx.arInvoice.count({ where: { orgId } });
  if (arCount === 0 && finance.ar?.invoices?.length) {
    for (const inv of finance.ar.invoices) {
      const row = inv as Record<string, unknown>;
      await tx.arInvoice.create({
        data: {
          id: String(row.id),
          orgId,
          invoiceNumber: String(row.invoiceNumber),
          customerCode: String(row.customerCode),
          customerName: String(row.customerName),
          linesJson: JSON.stringify(row.lines ?? []),
          subtotal: Number(row.subtotal ?? 0),
          tax: Number(row.tax ?? 0),
          shipping: Number(row.shipping ?? 0),
          discount: Number(row.discount ?? 0),
          total: Number(row.total ?? 0),
          amountPaid: Number(row.amountPaid ?? 0),
          balance: Number(row.balance ?? row.total ?? 0),
          status: String(row.status ?? "OPEN").toUpperCase(),
          terms: row.terms ? String(row.terms) : null,
          issuedAt: parseDateOnly(String(row.issuedAt)),
          dueAt: parseDateOnly(String(row.dueAt)),
          source: row.source ? String(row.source) : null,
          sourceRef: row.sourceRef ? String(row.sourceRef) : null,
        },
      });
    }
    for (const pay of finance.ar.payments ?? []) {
      const row = pay as Record<string, unknown>;
      const payment = await tx.arPayment.create({
        data: {
          id: String(row.id),
          orgId,
          customerCode: String(row.customerCode),
          amount: Number(row.amount ?? 0),
          unapplied: Number(row.unapplied ?? 0),
          method: String(row.method ?? "cash").toUpperCase(),
          paidAt: parseDateOnly(String(row.at ?? row.paidAt)),
          memo: row.memo ? String(row.memo) : null,
        },
      });
      const applied = (row.applied as { invoiceId: string; amount: number }[]) ?? [];
      for (const alloc of applied) {
        await tx.arPaymentAllocation.create({
          data: {
            orgId,
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          },
        });
      }
    }
    counts.arInvoices = finance.ar.invoices.length;
    counts.arPayments = finance.ar.payments?.length ?? 0;
  }

  const apCount = await tx.apBill.count({ where: { orgId } });
  if (apCount === 0 && finance.ap?.bills?.length) {
    for (const bill of finance.ap.bills) {
      const row = bill as Record<string, unknown>;
      await tx.apBill.create({
        data: {
          id: String(row.id),
          orgId,
          billNumber: String(row.billNumber),
          vendorCode: String(row.vendorCode),
          vendorName: String(row.vendorName),
          poId: row.poId ? String(row.poId) : null,
          linesJson: JSON.stringify(row.lines ?? []),
          subtotal: Number(row.subtotal ?? 0),
          tax: Number(row.tax ?? 0),
          total: Number(row.total ?? 0),
          amountPaid: Number(row.amountPaid ?? 0),
          balance: Number(row.balance ?? row.total ?? 0),
          status: String(row.status ?? "OPEN").toUpperCase(),
          billDate: parseDateOnly(String(row.billDate)),
          dueDate: parseDateOnly(String(row.dueDate)),
        },
      });
    }
    counts.apBills = finance.ap.bills.length;
  }

  return counts;
}

async function runOperationalImport(
  orgId: string,
  snapshot: LocalStorageMigrationSnapshot,
): Promise<MigrationModuleCounts> {
  const m = snapshot.modules;
  const counts: MigrationModuleCounts = {};
  const skuToItemId = new Map<string, string>();
  const partyIds = new Set<string>();

  return getPrisma().$transaction(async (tx) => {
    // 1. Locations
    for (const loc of m.locations ?? []) {
      await tx.stockLocation.upsert({
        where: { id: loc.id },
        create: {
          id: loc.id,
          orgId,
          label: loc.label,
          kind: loc.kind,
          taxState: loc.taxState ?? null,
          address: loc.address ?? null,
          phone: loc.phone ?? null,
          warehouseId: loc.warehouseId ?? null,
          registers: loc.registers?.length ? JSON.stringify(loc.registers) : null,
          managerName: loc.managerName ?? null,
          isActive: loc.active !== false,
        },
        update: {},
      });
    }
    counts.stockLocations = m.locations?.length ?? 0;

    // 2. CRM parties + activities + reminders
    for (const entity of m.crm?.entities ?? []) {
      partyIds.add(entity.id);
      await tx.crmParty.upsert({
        where: { id: entity.id },
        create: {
          id: entity.id,
          orgId,
          code: entity.code,
          name: entity.name,
          kind: entity.kind,
          country: entity.country,
          contact: entity.contact,
          ytdValue: entity.ytdValue ?? 0,
          status: entity.status ?? "active",
        },
        update: {},
      });
    }
    for (const act of m.crm?.activities ?? []) {
      if (!partyIds.has(act.entityId)) continue;
      await tx.crmActivity.upsert({
        where: { id: act.id },
        create: {
          id: act.id,
          orgId,
          partyId: act.entityId,
          type: act.type,
          subject: act.subject,
          body: act.body,
          occurredAt: parseDate(act.at),
        },
        update: {},
      });
    }
    for (const rem of m.crm?.reminders ?? []) {
      if (!partyIds.has(rem.entityId)) continue;
      await tx.crmReminder.upsert({
        where: { id: rem.id },
        create: {
          id: rem.id,
          orgId,
          partyId: rem.entityId,
          title: rem.title,
          dueAt: parseDate(rem.dueAt),
          completed: rem.completed ?? false,
        },
        update: {},
      });
    }
    counts.crmParties = m.crm?.entities?.length ?? 0;

    // 3. Inventory + movements
    for (const item of m.inventory?.items ?? []) {
      skuToItemId.set(item.sku.toUpperCase(), item.id);
      await tx.inventoryItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          orgId,
          sku: item.sku,
          name: item.name,
          category: item.category,
          uom: item.uom,
          onHand: item.onHand,
          reorderLevel: item.reorderLevel,
          unitCost: item.unitCost,
          warehouse: item.warehouse,
          binLocation: item.location,
          barcode: item.barcode ?? null,
          qrCode: item.qrCode ?? null,
          status: item.status,
        },
        update: {},
      });
    }
    for (const mv of m.inventory?.movements ?? []) {
      const itemId = skuToItemId.get(mv.sku.toUpperCase());
      await tx.inventoryMovement.upsert({
        where: { id: mv.id },
        create: {
          id: mv.id,
          orgId,
          itemId: itemId ?? null,
          sku: mv.sku,
          type: mv.type,
          qty: mv.qty,
          reason: mv.reason,
          warehouse: mv.warehouse,
          occurredAt: parseDate(mv.at),
        },
        update: {},
      });
    }
    counts.inventoryItems = m.inventory?.items?.length ?? 0;
    counts.inventoryMovements = m.inventory?.movements?.length ?? 0;

    // 4. BOMs
    for (const bom of m.manufacturing?.boms ?? []) {
      await tx.bom.upsert({
        where: { id: bom.id },
        create: {
          id: bom.id,
          orgId,
          bomCode: bom.bomCode,
          name: bom.name,
          version: bom.version,
          productSku: bom.productSku,
          effectiveFrom: parseDateOnly(bom.effectiveFrom),
          notes: bom.notes ?? null,
        },
        update: {},
      });
      for (const line of bom.lines) {
        await tx.bomLine.upsert({
          where: { id: line.id },
          create: {
            id: line.id,
            orgId,
            bomId: bom.id,
            itemId: skuToItemId.get(line.sku.toUpperCase()) ?? null,
            sku: line.sku,
            material: line.material,
            qtyPerUnit: line.qtyPerUnit,
            uom: line.uom,
            unitCost: line.unitCost,
          },
          update: {},
        });
      }
    }
    counts.boms = m.manufacturing?.boms?.length ?? 0;

    // 5. Production batches + stages
    for (const batch of m.manufacturing?.batches ?? []) {
      await tx.productionBatch.upsert({
        where: { id: batch.id },
        create: {
          id: batch.id,
          orgId,
          code: batch.code,
          product: batch.product,
          client: batch.client,
          units: batch.units,
          startedAt: parseDateOnly(batch.startedAt),
          expectedCompletion: parseDateOnly(batch.expectedCompletion),
          cycleMonths: batch.cycleMonths,
          wipValue: batch.wipValue,
          status: batch.status,
        },
        update: {},
      });
      for (let index = 0; index < batch.stages.length; index++) {
        const stage = batch.stages[index];
        await tx.productionStage.upsert({
          where: { id: stage.id },
          create: {
            id: stage.id,
            orgId,
            batchId: batch.id,
            sortOrder: index,
            name: stage.name,
            status: stage.status,
            startedAt: stage.startedAt ? parseDate(stage.startedAt) : null,
            completedAt: stage.completedAt ? parseDate(stage.completedAt) : null,
            laborHours: stage.laborHours,
            machineHours: stage.machineHours,
            laborCost: stage.laborCost,
            machineCost: stage.machineCost,
            yieldPct: stage.yieldPct,
            scrapUnits: stage.scrapUnits,
          },
          update: {},
        });
      }
    }
    counts.productionBatches = m.manufacturing?.batches?.length ?? 0;

    // 6. Material usage + labor
    for (const usage of m.manufacturing?.materialUsage ?? []) {
      await tx.materialUsage.upsert({
        where: { id: usage.id },
        create: {
          id: usage.id,
          orgId,
          batchId: usage.batchId,
          sku: usage.sku,
          qty: usage.qty,
          usedAt: parseDate(usage.at),
        },
        update: {},
      });
    }
    for (const labor of m.manufacturing?.labor ?? []) {
      await tx.laborEntry.upsert({
        where: { id: labor.id },
        create: {
          id: labor.id,
          orgId,
          batchId: labor.batchId,
          stageId: labor.stageId,
          hours: labor.hours,
          rate: labor.rate,
          loggedAt: parseDate(labor.at),
        },
        update: {},
      });
    }

    // 7. Purchasing
    for (const po of m.purchasing?.orders ?? []) {
      await tx.purchaseOrder.upsert({
        where: { id: po.id },
        create: {
          id: po.id,
          orgId,
          poNumber: po.poNumber,
          vendorCode: po.vendorCode,
          vendorName: po.vendorName,
          status: po.status,
          warehouseId: po.warehouseId,
          expectedDelivery: parseDateOnly(po.expectedDelivery),
          taxAmount: po.taxAmount,
          shippingAmount: po.shippingAmount,
          notes: po.notes ?? null,
          createdAt: parseDateOnly(po.createdAt),
          approvedAt: po.approvedAt ? parseDateOnly(po.approvedAt) : null,
        },
        update: {},
      });
      for (const line of po.lines) {
        await tx.purchaseOrderLine.create({
          data: {
            orgId,
            poId: po.id,
            sku: line.sku,
            description: line.description,
            qty: line.qty,
            unitCost: line.unitCost,
          },
        });
      }
    }
    for (const gr of m.purchasing?.receipts ?? []) {
      await tx.goodsReceipt.upsert({
        where: { id: gr.id },
        create: {
          id: gr.id,
          orgId,
          poId: gr.poId,
          sku: gr.sku,
          qty: gr.qty,
          receivedAt: parseDate(gr.receivedAt),
        },
        update: {},
      });
    }
    counts.purchaseOrders = m.purchasing?.orders?.length ?? 0;

    // 8. Sales documents
    for (const quote of m.sales?.quotes ?? []) {
      await tx.salesQuote.upsert({
        where: { id: quote.id },
        create: {
          id: quote.id,
          orgId,
          quoteNumber: quote.quoteNumber,
          customerCode: quote.customerCode,
          customerName: quote.customerName,
          subtotal: quote.subtotal,
          tax: quote.tax,
          shipping: quote.shipping,
          discount: quote.discount,
          total: quote.total,
          terms: quote.terms,
          status: quote.status,
          validUntil: parseDateOnly(quote.validUntil),
          createdAt: parseDateOnly(quote.createdAt),
        },
        update: {},
      });
      for (const line of quote.lines) {
        await tx.salesQuoteLine.create({
          data: {
            quoteId: quote.id,
            sku: line.sku,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
          },
        });
      }
    }
    for (const order of m.sales?.orders ?? []) {
      await tx.salesOrder.upsert({
        where: { id: order.id },
        create: {
          id: order.id,
          orgId,
          orderNumber: order.orderNumber,
          quoteId: order.quoteId ?? null,
          customerCode: order.customerCode,
          customerName: order.customerName,
          subtotal: order.subtotal,
          tax: order.tax,
          shipping: order.shipping,
          discount: order.discount,
          total: order.total,
          terms: order.terms,
          status: order.status,
          createdAt: parseDateOnly(order.createdAt),
        },
        update: {},
      });
      for (const line of order.lines) {
        await tx.salesOrderLine.create({
          data: {
            orderId: order.id,
            sku: line.sku,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
          },
        });
      }
    }
    for (const inv of m.sales?.invoices ?? []) {
      await tx.salesInvoice.upsert({
        where: { id: inv.id },
        create: {
          id: inv.id,
          orgId,
          invoiceNumber: inv.invoiceNumber,
          orderId: inv.orderId ?? null,
          customerCode: inv.customerCode,
          customerName: inv.customerName,
          subtotal: inv.subtotal,
          tax: inv.tax,
          shipping: inv.shipping,
          discount: inv.discount,
          total: inv.total,
          terms: inv.terms,
          status: inv.status,
          issuedAt: parseDateOnly(inv.issuedAt),
          dueAt: parseDateOnly(inv.dueAt),
          amountPaid: inv.amountPaid,
          isRecurring: inv.recurring ?? false,
        },
        update: {},
      });
      for (const line of inv.lines) {
        await tx.salesInvoiceLine.create({
          data: {
            invoiceId: inv.id,
            sku: line.sku,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
          },
        });
      }
    }
    counts.salesQuotes = m.sales?.quotes?.length ?? 0;

    // 9. Import shipments
    for (const sh of m.imports?.shipments ?? []) {
      await tx.importShipment.upsert({
        where: { id: sh.id },
        create: {
          id: sh.id,
          orgId,
          reference: sh.reference,
          origin: sh.origin,
          destination: sh.destination,
          status: sh.status,
          customsTariffPct: sh.customsTariffPct,
          customsFees: sh.customsFees,
          freightCost: sh.freightCost,
          insuranceCost: sh.insuranceCost,
          landedCost: sh.landedCost,
          eta: parseDateOnly(sh.eta),
          landedCostApplied: sh.landedCostApplied ?? false,
        },
        update: {},
      });
      for (const line of sh.lines) {
        await tx.importShipmentLine.upsert({
          where: { id: line.id },
          create: {
            id: line.id,
            orgId,
            shipmentId: sh.id,
            sku: line.sku,
            description: line.description,
            qty: line.qty,
            unitValue: line.unitValue,
          },
          update: {},
        });
      }
      for (const att of sh.attachments) {
        await tx.importAttachmentMeta.upsert({
          where: { id: att.id },
          create: {
            id: att.id,
            orgId,
            shipmentId: sh.id,
            name: att.name,
            sizeBytes: att.size,
            attachedAt: parseDate(att.at),
          },
          update: {},
        });
      }
    }
    counts.importShipments = m.imports?.shipments?.length ?? 0;

    // 10. POS sales + queue
    for (const sale of m.pos?.sales ?? []) {
      await tx.posSale.upsert({
        where: { id: sale.id },
        create: {
          id: sale.id,
          orgId,
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
        },
        update: {},
      });
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
    }
    for (let position = 0; position < (m.pos?.queue ?? []).length; position++) {
      const saleId = m.pos!.queue[position];
      await tx.posOfflineQueue.upsert({
        where: { orgId_saleId: { orgId, saleId } },
        create: { orgId, saleId, position },
        update: { position },
      });
    }
    counts.posSales = m.pos?.sales?.length ?? 0;

    // 11. POS ops
    for (const oo of m.posOps?.onlineOrders ?? []) {
      await tx.posOnlineOrder.upsert({
        where: { id: oo.id },
        create: {
          id: oo.id,
          orgId,
          orderNumber: oo.orderNumber,
          customerName: oo.customerName,
          customerEmail: oo.customerEmail ?? null,
          fulfillment: oo.fulfillment,
          status: oo.status,
          locationId: oo.locationId,
          total: oo.total,
          placedAt: parseDate(oo.placedAt),
          linesJson: JSON.stringify(oo.lines),
        },
        update: {},
      });
    }
    for (const ret of m.posOps?.returns ?? []) {
      await tx.posReturn.upsert({
        where: { id: ret.id },
        create: {
          id: ret.id,
          orgId,
          saleRef: ret.saleRef,
          reason: ret.reason,
          refundMethod: ret.refundMethod,
          restocked: ret.restocked,
          linesJson: JSON.stringify(ret.lines),
          returnedAt: parseDate(ret.at),
        },
        update: {},
      });
    }
    for (const v of m.posOps?.voids ?? []) {
      await tx.posVoidAudit.upsert({
        where: { id: v.id },
        create: {
          id: v.id,
          orgId,
          saleRef: v.saleRef,
          reason: v.reason,
          managerPin: v.managerPin ?? null,
          voidedAt: parseDate(v.at),
        },
        update: {},
      });
    }

    // 12. Loyalty
    for (const acct of m.posLoyalty ?? []) {
      await tx.loyaltyAccount.upsert({
        where: { id: acct.id },
        create: {
          id: acct.id,
          orgId,
          customerCode: acct.customerCode,
          name: acct.name,
          points: acct.points,
          tier: acct.tier,
        },
        update: {},
      });
      for (const h of acct.history) {
        await tx.loyaltyTransaction.upsert({
          where: { id: h.id },
          create: {
            id: h.id,
            orgId,
            accountId: acct.id,
            type: h.type,
            points: h.points,
            ref: h.ref,
            occurredAt: parseDate(h.at),
          },
          update: {},
        });
      }
    }
    counts.loyaltyAccounts = m.posLoyalty?.length ?? 0;

    // 13. CRM pipeline
    for (const opp of m.crmPipeline?.opportunities ?? []) {
      if (!partyIds.has(opp.entityId)) continue;
      await tx.crmOpportunity.upsert({
        where: { id: opp.id },
        create: {
          id: opp.id,
          orgId,
          partyId: opp.entityId,
          title: opp.title,
          stage: opp.stage,
          probability: opp.probability,
          expectedCloseDate: parseDateOnly(opp.expectedCloseDate),
          expectedRevenue: opp.expectedRevenue,
          owner: opp.owner,
          createdAt: parseDate(opp.createdAt),
          updatedAt: parseDate(opp.updatedAt),
        },
        update: {},
      });
    }
    for (const task of m.crmPipeline?.tasks ?? []) {
      if (!partyIds.has(task.entityId)) continue;
      await tx.crmTask.upsert({
        where: { id: task.id },
        create: {
          id: task.id,
          orgId,
          partyId: task.entityId,
          opportunityId: task.opportunityId ?? null,
          title: task.title,
          dueAt: parseDate(task.dueAt),
          completed: task.completed ?? false,
          type: task.type,
        },
        update: {},
      });
    }
    counts.crmOpportunities = m.crmPipeline?.opportunities?.length ?? 0;

    // 14. Data import history
    for (const entry of m.dataImportHistory ?? []) {
      await tx.dataImportHistory.upsert({
        where: { id: entry.id },
        create: {
          id: entry.id,
          orgId,
          entity: entry.entity,
          fileName: entry.fileName,
          rowCount: entry.rowCount,
          successCount: entry.successCount,
          errorCount: entry.errorCount,
          status: entry.status,
          importedAt: parseDate(entry.at),
        },
        update: {},
      });
    }
    counts.dataImportHistory = m.dataImportHistory?.length ?? 0;

    const financeCounts = await importFinanceIfEmpty(tx, orgId, snapshot);
    return { ...counts, ...financeCounts };
  });
}

function verifyCounts(
  snapshot: LocalStorageMigrationSnapshot,
  imported: MigrationModuleCounts,
): void {
  const expectedItems = snapshot.modules.inventory?.items?.length ?? 0;
  const actualItems = imported.inventoryItems ?? 0;
  if (expectedItems > 0 && actualItems !== expectedItems) {
    throw new Error(
      `Inventory verification failed: expected ${expectedItems} items, imported ${actualItems}.`,
    );
  }

  const expectedMovements = snapshot.modules.inventory?.movements?.length ?? 0;
  const actualMovements = imported.inventoryMovements ?? 0;
  if (expectedMovements > 0 && actualMovements !== expectedMovements) {
    throw new Error(
      `Inventory movement verification failed: expected ${expectedMovements}, imported ${actualMovements}.`,
    );
  }
}

export async function importLocalStorageSnapshot(
  snapshot: LocalStorageMigrationSnapshot | Record<string, unknown>,
  orgId = ORG_DEFAULT,
): Promise<MigrationImportResult> {
  const payload = snapshot as LocalStorageMigrationSnapshot;
  const status = await getLocalStorageMigrationStatus(orgId);
  if (status.completed) {
    return { ok: true, skipped: true, skipReason: "already_completed", moduleCounts: status.moduleCounts ?? {} };
  }

  if (payload.isDemoMode) {
    await markMigrationRun(orgId, {
      status: "SKIPPED",
      sourceChecksum: payload.sourceChecksum,
      moduleCounts: normalizeModuleCounts({ skipped: 1 }),
      errorDetail: "demo_mode",
      completed: true,
    });
    logger.info("localStorage migration skipped — demo mode");
    return { ok: true, skipped: true, skipReason: "demo_mode", moduleCounts: {} };
  }

  if (!hasOperationalPayload(payload)) {
    await markMigrationRun(orgId, {
      status: "COMPLETED",
      sourceChecksum: payload.sourceChecksum,
      moduleCounts: normalizeModuleCounts({}),
      completed: true,
    });
    logger.info("localStorage migration completed — no operational payload");
    return { ok: true, moduleCounts: {} };
  }

  const checksum = payload.sourceChecksum ||
    createHash("sha256").update(JSON.stringify(payload.modules)).digest("hex");

  await markMigrationRun(orgId, {
    status: "RUNNING",
    sourceChecksum: checksum,
  });

  try {
    const moduleCounts = normalizeModuleCounts(await runOperationalImport(orgId, payload));
    verifyCounts(payload, moduleCounts);

    await markMigrationRun(orgId, {
      status: "COMPLETED",
      sourceChecksum: checksum,
      moduleCounts,
      errorDetail: null,
      completed: true,
    });

    await getPrisma().appMeta.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", schemaVersion: 2 },
      update: { schemaVersion: 2 },
    });

    logger.info("localStorage migration completed", { moduleCounts });
    return { ok: true, moduleCounts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markMigrationRun(orgId, {
      status: "FAILED",
      sourceChecksum: checksum,
      errorDetail: message,
      completed: false,
    });
    logger.error("localStorage migration failed", { message });
    return { ok: false, error: message };
  }
}
