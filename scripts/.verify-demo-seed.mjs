import { app } from "electron";

process.env.BENBEN_BUILD_FLAVOR = "demo";
process.env.NODE_ENV = "production";

await app.whenReady();
const database = await import("../dist-desktop/services/database.js");
try {
  await database.bootstrapDatabase();
  const db = database.getPrisma();
  const orgId = "default";
  const [
    parties,
    warehouses,
    stores,
    skus,
    batches,
    stages,
    labor,
    materials,
    boms,
    employees,
    pos,
    quotes,
    orders,
    salesInvoices,
    shipments,
    arInvoices,
    apBills,
    opportunities,
    activities,
  ] = await Promise.all([
    db.crmParty.count({ where: { orgId } }),
    db.stockLocation.count({ where: { orgId, kind: "warehouse" } }),
    db.stockLocation.count({ where: { orgId, kind: "store" } }),
    db.inventoryItem.count({ where: { orgId } }),
    db.productionBatch.count({ where: { orgId } }),
    db.productionStage.count({ where: { orgId } }),
    db.laborEntry.count({ where: { orgId } }),
    db.materialUsage.count({ where: { orgId } }),
    db.bom.count({ where: { orgId } }),
    db.employee.count(),
    db.purchaseOrder.count({ where: { orgId } }),
    db.salesQuote.count({ where: { orgId } }),
    db.salesOrder.count({ where: { orgId } }),
    db.salesInvoice.count({ where: { orgId } }),
    db.importShipment.count({ where: { orgId } }),
    db.arInvoice.count({ where: { orgId } }),
    db.apBill.count({ where: { orgId } }),
    db.crmOpportunity.count({ where: { orgId } }),
    db.crmActivity.count({ where: { orgId } }),
  ]);

  const batchAgg = await db.productionBatch.aggregate({
    where: { orgId },
    _sum: { wipValue: true },
  });
  const wipRows = await db.glJournalLine.findMany({
    where: { orgId, accountCode: "1210" },
    select: { debit: true, credit: true },
  });
  const wipLedger = Math.round(wipRows.reduce((s, r) => s + r.debit - r.credit, 0) * 100) / 100;
  const v2210 = await db.apBill.aggregate({
    where: { orgId, vendorCode: "V-2210" },
    _sum: { balance: true },
  });

  const report = {
    parties,
    warehouses,
    stores,
    skus,
    batches,
    stages,
    labor,
    materials,
    boms,
    employees,
    pos,
    quotes,
    orders,
    salesInvoices,
    shipments,
    arInvoices,
    apBills,
    opportunities,
    activities,
    operationalWip: batchAgg._sum.wipValue,
    wipLedger,
    v2210Balance: v2210._sum.balance,
  };

  const checks = [
    ["warehouses>=6", warehouses >= 6],
    ["skus==12", skus === 12],
    ["batches==4", batches === 4],
    ["employees>=8", employees >= 8],
    ["boms>=3", boms >= 3],
    ["pos>=3", pos >= 3],
    ["quotes>=4", quotes >= 4],
    ["shipments>=3", shipments >= 3],
    ["ar>=6", arInvoices >= 6],
    ["ap>=5", apBills >= 5],
    ["wip==4948900", wipLedger === 4_948_900],
    ["v2210==30400", Math.round(v2210._sum.balance ?? 0) === 30_400],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  console.log(JSON.stringify({ ok: failed.length === 0, failed, report }, null, 2));
  await database.disconnectDatabase();
  app.exit(failed.length === 0 ? 0 : 1);
} catch (err) {
  console.error(err);
  await database.disconnectDatabase().catch(() => undefined);
  app.exit(1);
}
