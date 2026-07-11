import { getPrisma } from "./database";
import { createApBill, payApBill } from "./finance/ap.service";
import { applyArPayment, createArCreditMemo, createArInvoice } from "./finance/ar.service";
import { getAccountBalance } from "./finance/gl.service";
import { postJournalWithIntegrity } from "./finance/journal-post.service";
import { createRevRecSchedule } from "./finance/rev-rec.service";
import { ORG_DEFAULT } from "./finance/types";
import { capitalizeWip } from "./finance/wip.service";
import { createEmployee, createTimecard } from "./hr.service";
import { createShipment } from "./operations/imports.service";
import { saveBom } from "./operations/manufacturing.service";
import { createOpportunity, createCrmTask } from "./operations/pipeline.service";
import { approvePO, createPurchaseOrder, receivePO } from "./operations/purchasing.service";
import { parseDateOnly } from "./operations/shared";
import { convertOrderToInvoice, convertQuoteToOrder, createQuote } from "./operations/sales.service";
import { isDemoBuild } from "../utils/build-flavor";
import { logger } from "../utils/logger";

const DEMO_SEED_MARKER = "demo-operational-seed-v3";
const DEMO_DASHBOARD_WIP_VALUE = 4_948_900;
const DEMO_PRIMARY_VENDOR_CODE = "V-2210";
const ACTOR = { userId: "demo-presenter-user", name: "Demo Presenter" };
const HUBS = [
  ["loc_wh_central", "Central Distribution Hub", "500 Logistics Pkwy, Metro City"],
  ["loc_wh_west", "West Coast Regional Hub", "800 Maritime St, Oakland CA"],
  ["loc_wh_east", "East Coast Regional Hub", "12 Port Way, Newark NJ"],
  ["loc_wh_south", "Southern Regional Hub", "4100 Commerce Dr, Dallas TX"],
  ["loc_wh_midwest", "Midwest Regional Hub", "2200 Rail Yard Rd, Chicago IL"],
  ["loc_wh_export", "Export Bonded Hub", "700 Harbor Blvd, Long Beach CA"],
] as const;
const ITEMS = [
  ["SF-A7", "SF-A7 Wafer Lot", "WIP / Finished", "lot", 3840, 20, 36],
  ["SF-X3", "SF-X3 Module", "WIP / Finished", "ea", 20080, 10, 18],
  ["SF-Q9", "SF-Q9 Sensor Array", "WIP / Finished", "ea", 46.67, 200, 420],
  ["RAW-SIL-100", "Silicon Wafer 100mm", "Raw Materials", "ea", 42.5, 200, 480],
  ["RAW-COP-50", "Copper Foil Roll 50m", "Raw Materials", "roll", 18.75, 80, 220],
  ["RAW-RES-01", "Photoresist Compound", "Raw Materials", "L", 95, 40, 96],
  ["PKG-BOX-A", "Anti-Static Packaging Box A", "Packaging", "ea", 2.4, 500, 1200],
  ["PKG-FOAM-02", "Protective Foam Insert", "Packaging", "ea", 0.85, 800, 2400],
  ["TOOL-PROBE-X", "Precision Test Probe Kit", "Tools", "kit", 310, 10, 7],
  ["FG-PWR-CTRL", "Power Controller Board", "Finished Goods", "ea", 185, 40, 88],
  ["MRO-GLOVE-N", "Cleanroom Nitrile Gloves (M)", "MRO", "box", 14.5, 30, 96],
  ["SPARE-FAN-120", "120mm Cooling Fan Assembly", "Spare Parts", "ea", 22, 25, 12],
] as const;
const BATCHES = [
  ["PB-24-0142", "SF-A7 Wafer Lot", "Helion Aerospace", 480, "2025-08-12", "2026-09-30", 13, "active", 1_842_500, "C-1042"],
  ["PB-24-0156", "SF-X3 Module", "Atlas Defense Systems", 120, "2025-04-02", "2026-06-15", 14, "active", 2_410_000, "C-1040"],
  ["PB-25-0008", "SF-A7 Wafer Lot", "Northwind Semis", 320, "2025-11-20", "2026-12-05", 12, "active", 612_400, "C-1043"],
  ["PB-25-0021", "SF-Q9 Sensor Array", "Tessera Robotics", 1800, "2026-01-08", "2027-04-22", 15, "planning", 84_000, "C-1044"],
] as const;

type OperationalSeedOptions = {
  /** Skip GL WIP capitalization (production finance seed may already own account 1210). */
  skipWipLedger?: boolean;
  /** Skip AR/AP demo ledgers (production finance seed may already own those tables). */
  skipArAp?: boolean;
};

function dateOnly(daysOffset = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + daysOffset);
  return value.toISOString().slice(0, 10);
}

/** Remove all Presenter Mode operational relations. This is intentionally demo-build-only. */
export async function wipeDemoOperationalData(orgId = ORG_DEFAULT): Promise<void> {
  if (!isDemoBuild()) return;
  const db = getPrisma();
  await db.$transaction(async (tx) => {
    const ap = await tx.apBill.findMany({ where: { orgId }, select: { journalEntryId: true } });
    const payments = await tx.apPayment.findMany({ where: { orgId }, select: { journalEntryId: true } });
    const ar = await tx.arInvoice.findMany({ where: { orgId }, select: { journalEntryId: true } });
    const arPayments = await tx.arPayment.findMany({ where: { orgId }, select: { journalEntryId: true } });
    const credits = await tx.arCreditMemo.findMany({ where: { orgId }, select: { journalEntryId: true } });
    await tx.apPaymentAllocation.deleteMany({ where: { orgId } }); await tx.apVendorCredit.deleteMany({ where: { orgId } });
    await tx.apPayment.deleteMany({ where: { orgId } }); await tx.apBill.deleteMany({ where: { orgId } });
    await tx.arPaymentAllocation.deleteMany({ where: { orgId } }); await tx.arCreditMemo.deleteMany({ where: { orgId } });
    await tx.arPayment.deleteMany({ where: { orgId } }); await tx.arInvoice.deleteMany({ where: { orgId } });
    await tx.revRecMilestone.deleteMany({ where: { orgId } }); await tx.revRecSchedule.deleteMany({ where: { orgId } });
    await tx.laborEntry.deleteMany({ where: { orgId } }); await tx.materialUsage.deleteMany({ where: { orgId } });
    await tx.productionStage.deleteMany({ where: { orgId } }); await tx.productionBatch.deleteMany({ where: { orgId } });
    await tx.bomLine.deleteMany({ where: { orgId } }); await tx.bom.deleteMany({ where: { orgId } });
    await tx.inventoryMovement.deleteMany({ where: { orgId } }); await tx.inventoryLocationBalance.deleteMany({ where: { orgId } });
    await tx.inventoryItem.deleteMany({ where: { orgId } }); await tx.stockLocation.deleteMany({ where: { orgId } });
    await tx.crmTask.deleteMany({ where: { orgId } }); await tx.crmOpportunity.deleteMany({ where: { orgId } });
    await tx.crmReminder.deleteMany({ where: { orgId } }); await tx.crmActivity.deleteMany({ where: { orgId } });
    await tx.crmParty.deleteMany({ where: { orgId } });
    await tx.goodsReceipt.deleteMany({ where: { orgId } }); await tx.purchaseOrderLog.deleteMany({ where: { orgId } });
    await tx.purchaseOrderLine.deleteMany({ where: { orgId } }); await tx.purchaseOrder.deleteMany({ where: { orgId } });
    await tx.salesInvoice.deleteMany({ where: { orgId } });
    await tx.salesOrder.deleteMany({ where: { orgId } });
    await tx.salesQuote.deleteMany({ where: { orgId } });
    await tx.importAttachmentMeta.deleteMany({ where: { orgId } }); await tx.importShipmentLine.deleteMany({ where: { orgId } });
    await tx.importShipment.deleteMany({ where: { orgId } });
    await tx.timecard.deleteMany({}); await tx.employee.deleteMany({}); await tx.payrollRun.deleteMany({});
    const entryIds = [...ap, ...payments, ...ar, ...arPayments, ...credits].map((row) => row.journalEntryId).filter((id): id is string => id !== null);
    const sourceEntries = await tx.glJournalEntry.findMany({ where: { orgId, source: { in: ["WIP", "AP", "AR"] } }, select: { id: true } });
    const ids = [...new Set([...entryIds, ...sourceEntries.map((entry) => entry.id)])];
    await tx.glPostingFingerprint.deleteMany({ where: { orgId, OR: [{ fingerprint: { startsWith: "demo-op-" } }, { module: { in: ["wip", "ap", "ar"] } }] } });
    if (ids.length) { await tx.glJournalLine.deleteMany({ where: { journalEntryId: { in: ids } } }); await tx.glJournalEntry.deleteMany({ where: { id: { in: ids } } }); }
  });
}

async function seedFoundation(orgId: string): Promise<void> {
  const db = getPrisma();
  await db.$transaction(async (tx) => {
    await tx.settings.upsert({ where: { id: "default" }, update: { orgId, companyName: "Summit Industrial Demo Co.", address: "500 Logistics Pkwy, Metro City, IL 60601", phone: "+1 (312) 555-0142", email: "info@summitindustrial.demo", taxId: "12-3456789" }, create: { id: "default", orgId, companyName: "Summit Industrial Demo Co.", address: "500 Logistics Pkwy, Metro City, IL 60601", phone: "+1 (312) 555-0142", email: "info@summitindustrial.demo", taxId: "12-3456789" } });
    const parties = [
      ["e_demo_c1042", "C-1042", "Helion Aerospace", "client", "USA", "procurement@helion.aero", "410 Orbital Way, Seattle WA", "+1 206-555-1042", "91-4820014", "Net 30", 4820000],
      ["e_demo_c1040", "C-1040", "Atlas Defense Systems", "client", "USA", "ops@atlasdef.com", "200 Arsenal Blvd, Arlington VA", "+1 703-555-1040", "54-3200001", "Net 30", 3200000],
      ["e_demo_c1043", "C-1043", "Northwind Semis", "client", "USA", "buyers@northwind.io", "17 Foundry Park, Austin TX", "+1 512-555-1043", "74-2140003", "Net 30", 2140000],
      ["e_demo_c1044", "C-1044", "Tessera Robotics", "client", "JPN", "supply@tessera.jp", "4-2 Shibaura, Tokyo", "+81 3-5555-1044", "JP-1044", "Net 30", 1360500],
      ["e_demo_c1045", "C-1045", "Veridian Health", "client", "USA", "procurement@veridian.health", "800 Wellness Ave, Boston MA", "+1 617-555-1045", "04-5501045", "Net 30", 890000],
      ["e_demo_c3001", "C-3001", "Northstar Retail Group", "client", "USA", "buying@northstarretail.com", "35 Market Square, Denver CO", "+1 303-555-3001", "84-3013001", "Net 30", 625000],
      ["e_demo_v2210", "V-2210", "Wafertek Materials", "vendor", "TWN", "sales@wafertek.tw", "88 Hsinchu Science Park, Taiwan", "+886 3-555-2210", "TW-2210", "Net 30", 980000],
      ["e_demo_v2211", "V-2211", "Lumen Optics GmbH", "vendor", "DEU", "orders@lumen.de", "9 Optikstrasse, Munich", "+49 89-555-2211", "DE-2211", "Net 30", 612300],
      ["e_demo_v2212", "V-2212", "PrecisionPCB Co.", "vendor", "KOR", "ap@precisionpcb.kr", "45 Tech Valley, Seoul", "+82 2-555-2212", "KR-2212", "Net 30", 240900],
      ["e_demo_v3301", "V-3301", "Coastal Freight", "vendor", "USA", "dispatch@coastalfreight.com", "1 Harbor Way, Long Beach CA", "+1 562-555-3301", "95-3301001", "Net 30", 310000],
      ["e_demo_v4400", "V-4400", "Summit Chemicals", "vendor", "USA", "orders@summitchem.demo", "700 Chemical Row, Houston TX", "+1 713-555-4400", "76-4400001", "Net 30", 185000],
    ] as const;
    for (const [id, code, name, kind, country, contact, address, phone, taxId, paymentTerms, ytdValue] of parties) await tx.crmParty.create({ data: { id, orgId, code, name, kind, country, contact, address, phone, taxId, paymentTerms, ytdValue, status: "active" } });
    for (const [id, label, address] of HUBS) await tx.stockLocation.create({ data: { id, orgId, label, kind: "warehouse", address, managerName: "Regional Operations", isActive: true } });
    for (const [id, label, address, warehouseId] of [["loc_store_downtown", "Downtown Showroom", "120 Market St, Metro City", "loc_wh_central"], ["loc_store_west", "Bay Area Store", "56 Embarcadero, Oakland CA", "loc_wh_west"], ["loc_store_north", "Northside Retail", "8800 North Ave, Chicago IL", "loc_wh_midwest"], ["loc_store_south", "South Campus Outlet", "45 Innovation Dr, Dallas TX", "loc_wh_south"]] as const) await tx.stockLocation.create({ data: { id, orgId, label, kind: "store", address, warehouseId, registers: JSON.stringify(["Register 1", "Register 2"]), managerName: "Retail Lead", isActive: true } });
    for (const [index, [sku, name, category, uom, unitCost, reorderLevel, onHand]] of ITEMS.entries()) {
      const id = `inv_demo_${index}`;
      await tx.inventoryItem.create({ data: { id, orgId, sku, name, category, uom, unitCost, reorderLevel, onHand, warehouse: HUBS[index % HUBS.length][1], binLocation: `A-${String(index + 1).padStart(2, "0")}`, barcode: `BB${sku.replaceAll("-", "")}`, status: "active" } });
      const first = onHand * 0.7; const second = onHand - first;
      await tx.inventoryLocationBalance.create({ data: { orgId, itemId: id, locationId: HUBS[index % HUBS.length][0], qtyOnHand: first } });
      await tx.inventoryLocationBalance.create({ data: { orgId, itemId: id, locationId: HUBS[(index + 1) % HUBS.length][0], qtyOnHand: second } });
      for (const [type, qty, days] of [["receive", onHand + 20, -45], ["issue", -12, -18], ["adjust", -8, -3]] as const) await tx.inventoryMovement.create({ data: { id: `mov_${index}_${type}`, orgId, itemId: id, sku, type, qty, reason: DEMO_SEED_MARKER, warehouse: HUBS[index % HUBS.length][1], occurredAt: parseDateOnly(dateOnly(days)) } });
    }
    await tx.crmActivity.create({ data: { id: "crm_act_helion", orgId, partyId: "e_demo_c1042", type: "call", subject: "2026 production forecast", body: "Confirmed Helion Q3 demand and qualification requirements.", occurredAt: new Date() } });
    await tx.crmActivity.create({ data: { id: "crm_act_atlas", orgId, partyId: "e_demo_c1040", type: "email", subject: "Atlas program quote", body: "Sent revised milestone pricing.", occurredAt: new Date() } });
    await tx.crmActivity.create({ data: { id: "crm_act_northwind", orgId, partyId: "e_demo_c1043", type: "note", subject: "Qualification roadmap", body: "Northwind is evaluating SF-Q9 for its next-generation fabrication line.", occurredAt: new Date() } });
    await tx.crmReminder.create({ data: { id: "crm_rem_helion", orgId, partyId: "e_demo_c1042", title: "Executive account review", dueAt: parseDateOnly(dateOnly(7)), completed: false } });
    await tx.crmReminder.create({ data: { id: "crm_rem_veridian", orgId, partyId: "e_demo_c1045", title: "Follow up on pilot delivery", dueAt: parseDateOnly(dateOnly(12)), completed: false } });
  });
}

async function seedPeopleBomsAndBatches(
  orgId: string,
  options: OperationalSeedOptions = {},
): Promise<void> {
  const db = getPrisma();
  const employeeSpecs: Array<{ name: string; jobTitle: string; payType: string; taxClassification: string; baseWage: number }> = [
    { name: "Avery Chen", jobTitle: "Production Tech", payType: "HOURLY", taxClassification: "W2", baseWage: 39 },
    { name: "Morgan Reed", jobTitle: "CNC Operator", payType: "HOURLY", taxClassification: "W2", baseWage: 42 },
    { name: "Jordan Patel", jobTitle: "QA Inspector", payType: "HOURLY", taxClassification: "W2", baseWage: 44 },
    { name: "Casey Brooks", jobTitle: "Warehouse Lead", payType: "SALARIED", taxClassification: "W2", baseWage: 78000 },
    { name: "Riley Morgan", jobTitle: "Buyer", payType: "SALARIED", taxClassification: "W2", baseWage: 72000 },
    { name: "Taylor Kim", jobTitle: "Controller", payType: "SALARIED", taxClassification: "W2", baseWage: 98000 },
    { name: "Drew Wilson", jobTitle: "Sales AE", payType: "SALARIED", taxClassification: "1099", baseWage: 88000 },
    { name: "Alex Rivera", jobTitle: "Plant Manager", payType: "SALARIED", taxClassification: "W2", baseWage: 115000 },
  ];
  const employees = await Promise.all(employeeSpecs.map((spec) => createEmployee(spec)));
  for (const [index, employee] of employees.entries()) {
    const card = await createTimecard({
      employeeId: employee.id,
      clockIn: `${dateOnly(-index - 2)}T08:00:00.000Z`,
      clockOut: index < 5 ? `${dateOnly(-index - 2)}T16:30:00.000Z` : null,
      totalHours: index < 5 ? 8.5 : 4,
    });
    if (index < 5) await db.timecard.update({ where: { id: card.id }, data: { approved: true } });
  }
  for (const [sku, lines] of [
    ["SF-A7", [["RAW-SIL-100", "Silicon Wafer 100mm", 1, "ea", 42.5], ["RAW-RES-01", "Photoresist Compound", 0.12, "L", 95], ["PKG-BOX-A", "Anti-Static Packaging Box A", 1, "ea", 2.4]]],
    ["SF-X3", [["RAW-SIL-100", "Silicon Wafer 100mm", 0.4, "ea", 42.5], ["RAW-COP-50", "Copper Foil Roll 50m", 0.3, "roll", 18.75], ["PKG-FOAM-02", "Protective Foam Insert", 1, "ea", 0.85]]],
    ["SF-Q9", [["RAW-SIL-100", "Silicon Wafer 100mm", 0.08, "ea", 42.5], ["RAW-RES-01", "Photoresist Compound", 0.03, "L", 95], ["PKG-BOX-A", "Anti-Static Packaging Box A", 1, "ea", 2.4]]],
  ] as const) {
    await saveBom(orgId, {
      id: `bom_demo_${sku}`,
      bomCode: `BOM-${sku}`,
      name: `${sku} Production BOM`,
      version: "1.0",
      productSku: sku,
      effectiveFrom: dateOnly(-180),
      notes: "Presenter Mode standard production bill of materials",
      lines: lines.map(([lineSku, material, qtyPerUnit, uom, unitCost], i) => ({
        id: `bom_line_${sku}_${i}`,
        sku: lineSku,
        material,
        qtyPerUnit,
        uom,
        unitCost,
      })),
    });
  }
  await db.$transaction(async (tx) => {
    for (const [index, [code, product, client, units, startedAt, expectedCompletion, cycleMonths, status, wipValue]] of BATCHES.entries()) {
      const id = `batch_demo_${code.replaceAll("-", "").toLowerCase()}`;
      await tx.productionBatch.create({
        data: {
          id,
          orgId,
          code,
          product,
          client,
          units,
          startedAt: parseDateOnly(startedAt),
          expectedCompletion: parseDateOnly(expectedCompletion),
          cycleMonths,
          status,
          wipValue,
        },
      });
      for (const [stageIndex, name] of ["Substrate Prep", "Photolithography", "Etch & Deposition", "Doping", "Metallization", "Test & Burn-In", "Final QA / Packaging"].entries()) {
        const active = stageIndex === (index === 1 ? 4 : index === 2 ? 1 : 0);
        const completed = stageIndex < (index === 1 ? 4 : index === 0 ? 2 : 0);
        const stageId = `stage_${id}_${stageIndex}`;
        await tx.productionStage.create({
          data: {
            id: stageId,
            orgId,
            batchId: id,
            sortOrder: stageIndex,
            name,
            status: active ? "in_progress" : completed ? "completed" : "pending",
            laborHours: completed || active ? 120 + stageIndex * 35 : 0,
            machineHours: completed || active ? 90 + stageIndex * 40 : 0,
            laborCost: completed || active ? (120 + stageIndex * 35) * 78 : 0,
            machineCost: completed || active ? (90 + stageIndex * 40) * 145 : 0,
            yieldPct: completed || active ? 97.5 : 0,
            scrapUnits: completed || active ? stageIndex + 2 : 0,
          },
        });
        if (completed || active) {
          await tx.laborEntry.create({
            data: {
              id: `labor_${id}_${stageIndex}`,
              orgId,
              batchId: id,
              stageId,
              hours: 120 + stageIndex * 35,
              rate: 78,
              loggedAt: parseDateOnly(dateOnly(-30 + stageIndex)),
            },
          });
        }
      }
      for (const [materialIndex, sku] of ["RAW-SIL-100", "RAW-RES-01", "PKG-BOX-A"].entries()) {
        await tx.materialUsage.create({
          data: {
            id: `material_${id}_${materialIndex}`,
            orgId,
            batchId: id,
            sku,
            qty: 20 * (materialIndex + 1),
            usedAt: parseDateOnly(dateOnly(-20 + materialIndex)),
          },
        });
      }
    }
  });
  const batchSum = await db.productionBatch.aggregate({ where: { orgId }, _sum: { wipValue: true } });
  if (Math.round(batchSum._sum.wipValue ?? 0) !== DEMO_DASHBOARD_WIP_VALUE) throw new Error("Demo batch WIP total is invalid.");
  if (options.skipWipLedger) return;
  for (const [code, , , , , , , , amount] of BATCHES) {
    await capitalizeWip(
      {
        amount,
        batchCode: code,
        memo: `Presenter Mode WIP capitalization · ${code}`,
        sourceRef: code,
        idempotencyKey: `demo-op-wip-${code}`,
        creditAccountCode: "5000",
      },
      orgId,
    );
  }
  if (Math.round(await getAccountBalance("1210", orgId)) !== DEMO_DASHBOARD_WIP_VALUE) {
    throw new Error("Demo WIP ledger did not reconcile to account 1210.");
  }
}

async function seedCommercialData(
  orgId: string,
  options: OperationalSeedOptions = {},
): Promise<void> {
  const db = getPrisma();
  const opportunity = await createOpportunity(orgId, { id: "opp_demo_helion", entityId: "e_demo_c1042", title: "Helion Q4 wafer program", stage: "negotiation", probability: 75, expectedCloseDate: dateOnly(30), expectedRevenue: 2450000, owner: "Drew Wilson", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await createOpportunity(orgId, { id: "opp_demo_atlas", entityId: "e_demo_c1040", title: "Atlas SF-X3 expansion", stage: "proposal", probability: 55, expectedCloseDate: dateOnly(45), expectedRevenue: 980000, owner: "Drew Wilson", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await createOpportunity(orgId, { id: "opp_demo_northwind", entityId: "e_demo_c1043", title: "Northwind SF-Q9 qualification", stage: "qualified", probability: 40, expectedCloseDate: dateOnly(60), expectedRevenue: 720000, owner: "Drew Wilson", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await createOpportunity(orgId, { id: "opp_demo_veridian", entityId: "e_demo_c1045", title: "Veridian pilot kits", stage: "lead", probability: 25, expectedCloseDate: dateOnly(75), expectedRevenue: 210000, owner: "Drew Wilson", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await createCrmTask(orgId, { entityId: "e_demo_c1042", opportunityId: opportunity.id, title: "Confirm Helion engineering acceptance criteria", dueAt: `${dateOnly(4)}T15:00:00.000Z`, type: "follow_up" });
  await createCrmTask(orgId, { entityId: "e_demo_c1040", opportunityId: "opp_demo_atlas", title: "Send Atlas technical datasheet pack", dueAt: `${dateOnly(6)}T15:00:00.000Z`, type: "task" });
  await createCrmTask(orgId, { entityId: "e_demo_c1043", opportunityId: "opp_demo_northwind", title: "Schedule Northwind plant visit", dueAt: `${dateOnly(9)}T15:00:00.000Z`, type: "meeting" });
  const poDraft = await createPurchaseOrder(orgId, { id: "po_demo_mr001", poNumber: "PO-2026-0101", vendorCode: "V-2210", vendorName: "Wafertek Materials", warehouseId: "loc_wh_central", expectedDelivery: dateOnly(21), taxAmount: 0, shippingAmount: 600, notes: "Material Request MR-2026-001: replenish silicon safety stock", status: "draft", lines: [{ sku: "RAW-SIL-100", description: "Silicon Wafer 100mm", qty: 500, unitCost: 42.5 }], createdAt: dateOnly(-2) }, ACTOR);
  const poPending = await createPurchaseOrder(orgId, { id: "po_demo_approved", poNumber: "PO-2026-0102", vendorCode: "V-2211", vendorName: "Lumen Optics GmbH", warehouseId: "loc_wh_west", expectedDelivery: dateOnly(12), taxAmount: 0, shippingAmount: 850, notes: "Optics replenishment", status: "pending_approval", lines: [{ sku: "TOOL-PROBE-X", description: "Precision Test Probe Kit", qty: 20, unitCost: 310 }], createdAt: dateOnly(-5), requestedByUserId: ACTOR.userId, requestedByName: ACTOR.name }, ACTOR);
  await approvePO(orgId, poPending.id, ACTOR);
  const poReceived = await createPurchaseOrder(orgId, { id: "po_demo_received", poNumber: "PO-2026-0098", vendorCode: "V-2212", vendorName: "PrecisionPCB Co.", warehouseId: "loc_wh_east", expectedDelivery: dateOnly(-4), taxAmount: 0, shippingAmount: 400, notes: "Material Request MR-2026-002: PCB production supply", status: "pending_approval", lines: [{ sku: "RAW-COP-50", description: "Copper Foil Roll 50m", qty: 100, unitCost: 18.75 }], createdAt: dateOnly(-15), requestedByUserId: ACTOR.userId, requestedByName: ACTOR.name }, ACTOR);
  await approvePO(orgId, poReceived.id, ACTOR); await receivePO(orgId, poReceived.id, "RAW-COP-50", 100, ACTOR);
  void poDraft;
  const quoteSpecs: Array<{ customerCode: string; customerName: string; sku: string; qty: number; unitPrice: number }> = [
    { customerCode: "C-1042", customerName: "Helion Aerospace", sku: "SF-A7", qty: 120, unitPrice: 8500 },
    { customerCode: "C-1040", customerName: "Atlas Defense Systems", sku: "SF-X3", qty: 30, unitPrice: 28500 },
    { customerCode: "C-1043", customerName: "Northwind Semis", sku: "SF-Q9", qty: 500, unitPrice: 165 },
    { customerCode: "C-1044", customerName: "Tessera Robotics", sku: "FG-PWR-CTRL", qty: 80, unitPrice: 310 },
  ];
  const quotes = await Promise.all(
    quoteSpecs.map((spec, index) =>
      createQuote(orgId, {
        id: `quote_demo_${index}`,
        quoteNumber: `QT-2026-0${index + 1}`,
        customerCode: spec.customerCode,
        customerName: spec.customerName,
        lines: [{ sku: spec.sku, description: `${spec.sku} production supply`, qty: spec.qty, unitPrice: spec.unitPrice }],
        subtotal: spec.qty * spec.unitPrice,
        tax: 0,
        shipping: 0,
        discount: 0,
        total: spec.qty * spec.unitPrice,
        terms: "Net 30",
        status: "open",
        validUntil: dateOnly(30),
        createdAt: dateOnly(-index - 3),
      }),
    ),
  );
  for (const quote of quotes.slice(0, 3)) {
    const order = await convertQuoteToOrder(orgId, quote.id);
    if (order) await convertOrderToInvoice(orgId, order.id);
  }
  for (const [reference, origin, destination, status, sku, qty, unitValue] of [["IMP-2026-001", "Taiwan", HUBS[5][1], "in_transit", "RAW-SIL-100", 600, 42.5], ["IMP-2026-002", "Germany", HUBS[0][1], "customs", "TOOL-PROBE-X", 30, 310], ["IMP-2026-003", "Korea", HUBS[2][1], "delivered", "RAW-COP-50", 250, 18.75]] as const) await createShipment(orgId, { id: `shipment_${reference}`, reference, origin, destination, status, customsTariffPct: 3, customsFees: 450, freightCost: 1200, insuranceCost: 180, landedCost: 0, lines: [{ id: `shipment_line_${reference}`, sku, description: `${sku} import`, qty, unitValue }], eta: dateOnly(status === "delivered" ? -2 : 18), attachments: [] });
  if (options.skipArAp) return;
  const arInvoices = []; for (const [customerCode, customerName, amount, issuedDays, dueDays] of [["C-1042", "Helion Aerospace", 1250000, -75, -45], ["C-1040", "Atlas Defense Systems", 680000, -40, -10], ["C-1043", "Northwind Semis", 295000, -20, 10], ["C-1044", "Tessera Robotics", 148000, -100, -70], ["C-1045", "Veridian Health", 92000, -5, 25], ["C-3001", "Northstar Retail Group", 64000, -15, 15]] as const) arInvoices.push(await createArInvoice({ customerCode, customerName, lines: [{ sku: "SF-A7", description: "Presenter Mode customer invoice", qty: 1, unitPrice: amount }], subtotal: amount, tax: 0, terms: "Net 30", issuedAt: dateOnly(issuedDays), dueAt: dateOnly(dueDays), source: "DEMO", sourceRef: `demo-op-ar-${customerCode}`, idempotencyKey: `demo-op-ar-${customerCode}` }, orgId));
  await applyArPayment({ customerCode: "C-1042", amount: 300000, allocations: [{ invoiceId: arInvoices[0].id, amount: 300000 }], method: "Wire", idempotencyKey: "demo-op-ar-payment-helion" }, orgId);
  await createArCreditMemo({ customerCode: "C-1044", amount: 12000, reason: "Demo quality allowance", invoiceId: arInvoices[3].id, idempotencyKey: "demo-op-ar-credit-tessera" }, orgId);
  await createRevRecSchedule({ invoiceId: arInvoices[0].id, totalAmount: arInvoices[0].total, milestones: [{ milestoneName: "Engineering acceptance", percentage: 25 }, { milestoneName: "Production release", percentage: 50 }, { milestoneName: "Final delivery", percentage: 25 }] }, orgId);
  await postJournalWithIntegrity({ memo: "Presenter Mode deferred revenue reclassification", lines: [{ accountCode: "4000", debit: 100000, credit: 0 }, { accountCode: "2200", debit: 0, credit: 100000 }], source: "AR", module: "ar", reference: arInvoices[0].id, idempotencyKey: "demo-op-ar-deferred-reclass" }, orgId);
  for (const [vendorCode, vendorName, total, payment] of [["V-2210", "Wafertek Materials", 50400, 20000], ["V-2211", "Lumen Optics GmbH", 38000, 38000], ["V-2212", "PrecisionPCB Co.", 26750, 12000], ["V-3301", "Coastal Freight", 15400, 15400], ["V-4400", "Summit Chemicals", 9100, 4500]] as const) { const bill = await createApBill({ vendorCode, vendorName, lines: [{ description: "Presenter Mode operational supply", qty: 1, unitCost: total }], subtotal: total, tax: 0, total, billDate: dateOnly(-35), dueDate: dateOnly(-5), idempotencyKey: `demo-op-ap-${vendorCode}` }, orgId); if (payment) await payApBill({ billId: bill.id, amount: payment, method: "ACH", idempotencyKey: `demo-op-ap-pay-${vendorCode}` }, orgId); }
  const balance = await db.apBill.aggregate({ where: { orgId, vendorCode: DEMO_PRIMARY_VENDOR_CODE }, _sum: { balance: true } });
  if (Math.round(balance._sum.balance ?? 0) !== 30_400) throw new Error("Wafertek AP balance must be 30,400.");
}

async function isOperationalWorkspaceEmpty(orgId: string): Promise<boolean> {
  const db = getPrisma();
  const [parties, locations, items, batches, employees, pos] = await Promise.all([
    db.crmParty.count({ where: { orgId } }),
    db.stockLocation.count({ where: { orgId } }),
    db.inventoryItem.count({ where: { orgId } }),
    db.productionBatch.count({ where: { orgId } }),
    db.employee.count(),
    db.purchaseOrder.count({ where: { orgId } }),
  ]);
  return parties === 0 && locations === 0 && items === 0 && batches === 0 && employees === 0 && pos === 0;
}

async function hydrateOperationalRelations(
  orgId: string,
  options: OperationalSeedOptions = {},
): Promise<void> {
  await seedFoundation(orgId);
  await seedPeopleBomsAndBatches(orgId, options);
  await seedCommercialData(orgId, options);
}

/** Wipe + sequential relational seed for Presenter Mode. */
export async function seedDemoOperationalData(orgId = ORG_DEFAULT): Promise<boolean> {
  if (!isDemoBuild()) return false;
  logger.info("Starting Presenter Mode relational seed", { orgId, marker: DEMO_SEED_MARKER });
  await wipeDemoOperationalData(orgId);
  await hydrateOperationalRelations(orgId);
  const db = getPrisma();
  const [parties, skus, warehouses, batches, employees, boms, pos, quotes, shipments, arInvoices, apBills] = await Promise.all([
    db.crmParty.count({ where: { orgId } }), db.inventoryItem.count({ where: { orgId } }), db.stockLocation.count({ where: { orgId, kind: "warehouse" } }), db.productionBatch.count({ where: { orgId } }), db.employee.count(), db.bom.count({ where: { orgId } }), db.purchaseOrder.count({ where: { orgId } }), db.salesQuote.count({ where: { orgId } }), db.importShipment.count({ where: { orgId } }), db.arInvoice.count({ where: { orgId } }), db.apBill.count({ where: { orgId } }),
  ]);
  logger.info("Presenter Mode relational seed complete", { orgId, marker: DEMO_SEED_MARKER, parties, skus, warehouses, batches, employees, boms, pos, quotes, shipments, arInvoices, apBills, wipLedger: await getAccountBalance("1210", orgId) });
  return true;
}

/**
 * Production packaged exe: one-shot Summit Industrial sample data when the
 * operational workspace is completely empty. Never wipes. Skips GL WIP / AR / AP
 * because finance demo seed already owns those ledgers on production boots.
 */
export async function seedSampleOperationalData(orgId = ORG_DEFAULT): Promise<boolean> {
  if (isDemoBuild()) return false;
  if (!(await isOperationalWorkspaceEmpty(orgId))) {
    logger.info("Sample operational seed skipped — operational data already present", { orgId });
    return false;
  }

  logger.info("Starting production sample operational seed", { orgId, marker: DEMO_SEED_MARKER });
  await hydrateOperationalRelations(orgId, { skipWipLedger: true, skipArAp: true });

  const db = getPrisma();
  const [parties, skus, warehouses, batches, employees, pos] = await Promise.all([
    db.crmParty.count({ where: { orgId } }),
    db.inventoryItem.count({ where: { orgId } }),
    db.stockLocation.count({ where: { orgId, kind: "warehouse" } }),
    db.productionBatch.count({ where: { orgId } }),
    db.employee.count(),
    db.purchaseOrder.count({ where: { orgId } }),
  ]);
  logger.info("Production sample operational seed complete", {
    orgId,
    marker: DEMO_SEED_MARKER,
    parties,
    skus,
    warehouses,
    batches,
    employees,
    pos,
  });
  return true;
}