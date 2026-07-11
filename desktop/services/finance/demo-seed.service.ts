import { getPrisma } from "../database";
import { logger } from "../../utils/logger";
import { isDemoBuild } from "../../utils/build-flavor";
import { applyArPayment, createArCreditMemo, createArInvoice } from "./ar.service";
import { createApBill, payApBill } from "./ap.service";
import { manualMatchBankTransaction, uploadBankStatement } from "./bank-reconciliation.service";
import { createBudgetPlan } from "./budget.service";
import { createFixedAsset, runMonthlyDepreciation } from "./fixed-assets.service";
import { postJournalWithIntegrity } from "./journal-post.service";
import { createRevRecSchedule } from "./rev-rec.service";
import { ORG_DEFAULT } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function daysAhead(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function hasTransactionalFinanceData(orgId: string): Promise<boolean> {
  const db = getPrisma();
  const [je, ar, ap, bank] = await Promise.all([
    db.glJournalEntry.count({ where: { orgId } }),
    db.arInvoice.count({ where: { orgId } }),
    db.apBill.count({ where: { orgId } }),
    db.bankStatement.count({ where: { orgId } }),
  ]);
  return je > 0 || ar > 0 || ap > 0 || bank > 0;
}

async function findUnmatchedCashLine(
  orgId: string,
  opts: { reference?: string; debit?: number; credit?: number },
): Promise<string | undefined> {
  const db = getPrisma();
  const lines = await db.glJournalLine.findMany({
    where: {
      orgId,
      accountCode: "1000",
      journalEntry: {
        status: "POSTED",
        reference: opts.reference,
      },
      reconciliationLogs: { none: {} },
    },
    include: { journalEntry: true },
    orderBy: { id: "desc" },
    take: 20,
  });

  for (const line of lines) {
    const debit = ROUND(line.debit);
    const credit = ROUND(line.credit);
    if (opts.debit != null && debit === ROUND(opts.debit)) return line.id;
    if (opts.credit != null && credit === ROUND(opts.credit)) return line.id;
  }
  return lines[0]?.id;
}

/**
 * Idempotent finance demo seed — runs only when transactional tables are empty.
 * Uses service-layer posts so GL hooks, fingerprints, and audit trails stay consistent.
 */
export async function seedFinanceDemoData(orgId = ORG_DEFAULT): Promise<boolean> {
  if (await hasTransactionalFinanceData(orgId)) {
    logger.info("Finance demo seed skipped — transactional data already present", { orgId });
    return false;
  }

  const db = getPrisma();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const issuedBase = daysAgo(45);

  logger.info("Seeding finance demo transactional data", { orgId });

  // 1. Opening balances (cash + inventory; AR/AP built from subledgers)
  await postJournalWithIntegrity(
    {
      memo: "Opening balances — demo seed",
      source: "MANUAL",
      module: "finance-seed",
      reference: "OB-2026",
      idempotencyKey: "finance-demo-ob-2026",
      entryDate: daysAgo(90),
      lines: [
        { accountCode: "1000", debit: 1_200_000, credit: 0, description: "Opening cash" },
        { accountCode: "1200", debit: 210_490, credit: 0, description: "Opening inventory" },
        { accountCode: "3000", debit: 0, credit: 1_410_490, description: "Opening equity" },
      ],
    },
    orgId,
  );

  // 2. Shipment COGS (inventory relief)
  await postJournalWithIntegrity(
    {
      memo: "Shipment SO-8821 — COGS",
      source: "MANUAL",
      module: "finance-seed",
      reference: "SO-8821-COGS",
      idempotencyKey: "finance-demo-so-8821-cogs",
      entryDate: daysAgo(30),
      lines: [
        { accountCode: "5000", debit: 118_400, credit: 0, description: "COGS — Helion shipment" },
        { accountCode: "1200", debit: 0, credit: 118_400, description: "Inventory relief" },
      ],
    },
    orgId,
  );

  const presenterMode = isDemoBuild();

  // Presenter Mode owns WIP / AR / AP via demo-operational-seed — skip here to avoid wipe conflicts.
  if (!presenterMode) {
  // 2b. WIP capitalization (manufacturing stage cost)
  await postJournalWithIntegrity(
    {
      memo: "WIP capitalization — Etch stage PB-24-0142",
      source: "WIP",
      module: "wip",
      reference: "PB-24-0142/S3",
      idempotencyKey: "finance-demo-wip-etch-pb24",
      entryDate: daysAgo(28),
      lines: [
        { accountCode: "1210", debit: 84_400, credit: 0, description: "WIP asset" },
        { accountCode: "5000", debit: 0, credit: 84_400, description: "Labor & materials to WIP" },
      ],
    },
    orgId,
  );

  // 3. AR invoices across aging buckets (CRM customer codes)
  const helionInv = await createArInvoice(
    {
      customerCode: "C-1042",
      customerName: "Helion Aerospace",
      lines: [{ sku: "SKU-4410", description: "Industrial controller bundle", qty: 40, unitPrice: 12_050 }],
      subtotal: 482_000,
      tax: 0,
      terms: "Net 30",
      issuedAt: iso(daysAgo(35)),
      dueAt: iso(daysAhead(14)),
      source: "SALES",
      sourceRef: "SO-8821",
      idempotencyKey: "finance-demo-ar-helion-so8821",
    },
    orgId,
  );

  // 3b. Milestone rev-rec — defer Helion contract revenue + schedule
  await postJournalWithIntegrity(
    {
      memo: "Reclass Helion SO-8821 revenue to deferred (milestone contract)",
      source: "REV_REC",
      module: "rev-rec",
      reference: "SO-8821-DEF",
      idempotencyKey: "finance-demo-rev-rec-defer-so8821",
      entryDate: daysAgo(34),
      lines: [
        { accountCode: "4000", debit: 482_000, credit: 0, description: "Revenue reclass to deferred" },
        { accountCode: "2200", debit: 0, credit: 482_000, description: "Deferred revenue liability" },
      ],
    },
    orgId,
  );

  await createRevRecSchedule(
    {
      invoiceId: helionInv.id,
      totalAmount: 482_000,
      milestones: [
        { milestoneName: "Design complete", percentage: 30 },
        { milestoneName: "Production release", percentage: 40 },
        { milestoneName: "Customer acceptance", percentage: 30 },
      ],
    },
    orgId,
  );

  const northwindInv = await createArInvoice(
    {
      customerCode: "C-1043",
      customerName: "Northwind Semis",
      lines: [{ sku: "SKU-2201", description: "Kraft liner rolls", qty: 12, unitPrice: 3_200 }],
      subtotal: 38_400,
      tax: 0,
      terms: "Net 30",
      issuedAt: iso(daysAgo(40)),
      dueAt: iso(daysAgo(18)),
      sourceRef: "INV-NW-1043",
      idempotencyKey: "finance-demo-ar-northwind",
    },
    orgId,
  );

  await createArInvoice(
    {
      customerCode: "C-1044",
      customerName: "Tessera Robotics",
      lines: [{ sku: "SKU-7780", description: "Calibration kits", qty: 26, unitPrice: 850 }],
      subtotal: 22_100,
      tax: 0,
      issuedAt: iso(daysAgo(50)),
      dueAt: iso(daysAgo(45)),
      sourceRef: "INV-TE-1044",
      idempotencyKey: "finance-demo-ar-tessera",
    },
    orgId,
  );

  await createArInvoice(
    {
      customerCode: "C-3001",
      customerName: "Northstar Retail Group",
      lines: [{ sku: "SKU-9012", description: "POS peripherals", qty: 16, unitPrice: 800 }],
      subtotal: 12_800,
      tax: 0,
      issuedAt: iso(daysAgo(70)),
      dueAt: iso(daysAgo(75)),
      sourceRef: "INV-NS-3001",
      idempotencyKey: "finance-demo-ar-northstar",
    },
    orgId,
  );

  await createArInvoice(
    {
      customerCode: "C-1045",
      customerName: "Veridian Health",
      lines: [{ sku: "SKU-6601", description: "Sterile packaging", qty: 40, unitPrice: 240 }],
      subtotal: 9_600,
      tax: 0,
      issuedAt: iso(daysAgo(120)),
      dueAt: iso(daysAgo(100)),
      sourceRef: "INV-VH-1045",
      idempotencyKey: "finance-demo-ar-veridian",
    },
    orgId,
  );

  await applyArPayment(
    {
      customerCode: "C-1042",
      amount: 200_000,
      method: "ACH",
      memo: "Partial payment — Helion SO-8821",
      allocations: [{ invoiceId: helionInv.id, amount: 200_000 }],
      idempotencyKey: "finance-demo-ar-pay-helion-200k",
    },
    orgId,
  );

  await createArCreditMemo(
    {
      customerCode: "C-1043",
      amount: 2_500,
      reason: "Freight allowance",
      invoiceId: northwindInv.id,
      idempotencyKey: "finance-demo-ar-cm-northwind",
    },
    orgId,
  );

  await applyArPayment(
    {
      customerCode: "C-1043",
      amount: 12_000,
      method: "Check",
      memo: "Partial — Northwind",
      allocations: [{ invoiceId: northwindInv.id, amount: 12_000 }],
      idempotencyKey: "finance-demo-ar-pay-northwind-12k",
    },
    orgId,
  );

  await applyArPayment(
    {
      customerCode: "C-1044",
      amount: 8_000,
      method: "Wire",
      memo: "Tessera partial",
      allocations: [],
      idempotencyKey: "finance-demo-ar-pay-tessera-8k",
    },
    orgId,
  );

  // 4. AP bills across aging buckets (vendor codes)
  const wafertekBill = await createApBill(
    {
      vendorCode: "V-2210",
      vendorName: "Wafertek Materials",
      lines: [{ description: "Aluminum sheet stock", qty: 120, unitCost: 420 }],
      subtotal: 50_400,
      tax: 0,
      total: 50_400,
      billDate: iso(daysAgo(25)),
      dueDate: iso(daysAhead(10)),
      idempotencyKey: "finance-demo-ap-wafertek",
    },
    orgId,
  );

  const apexBill = await createApBill(
    {
      vendorCode: "V-2211",
      vendorName: "Lumen Optics GmbH",
      lines: [{ description: "Optical assemblies", qty: 8, unitCost: 3_500 }],
      subtotal: 28_000,
      tax: 0,
      total: 28_000,
      billDate: iso(daysAgo(35)),
      dueDate: iso(daysAgo(20)),
      idempotencyKey: "finance-demo-ap-apex",
    },
    orgId,
  );

  const meridianBill = await createApBill(
    {
      vendorCode: "V-2212",
      vendorName: "PrecisionPCB Co.",
      lines: [{ description: "PCB fab lot", qty: 1, unitCost: 15_500 }],
      subtotal: 15_500,
      tax: 0,
      total: 15_500,
      billDate: iso(daysAgo(55)),
      dueDate: iso(daysAgo(50)),
      idempotencyKey: "finance-demo-ap-meridian",
    },
    orgId,
  );

  await createApBill(
    {
      vendorCode: "V-3301",
      vendorName: "Coastal Freight",
      lines: [{ description: "Port handling fees", qty: 1, unitCost: 4_800 }],
      subtotal: 4_800,
      tax: 0,
      total: 4_800,
      billDate: iso(daysAgo(80)),
      dueDate: iso(daysAgo(75)),
      idempotencyKey: "finance-demo-ap-coastal",
    },
    orgId,
  );

  await createApBill(
    {
      vendorCode: "V-4400",
      vendorName: "Summit Chemicals",
      lines: [{ description: "Industrial solvents", qty: 40, unitCost: 230 }],
      subtotal: 9_200,
      tax: 0,
      total: 9_200,
      billDate: iso(daysAgo(110)),
      dueDate: iso(daysAgo(100)),
      idempotencyKey: "finance-demo-ap-summit",
    },
    orgId,
  );

  await payApBill(
    {
      billId: wafertekBill.id,
      amount: 20_000,
      method: "ACH",
      memo: "Partial — Wafertek AP-4412",
      idempotencyKey: "finance-demo-ap-pay-wafertek-20k",
    },
    orgId,
  );

  await payApBill(
    {
      billId: apexBill.id,
      amount: 28_000,
      method: "Check",
      memo: "Paid in full — Apex",
      idempotencyKey: "finance-demo-ap-pay-apex-full",
    },
    orgId,
  );

  await payApBill(
    {
      billId: meridianBill.id,
      amount: 10_000,
      method: "ACH",
      memo: "Partial — Meridian freight",
      idempotencyKey: "finance-demo-ap-pay-meridian-10k",
    },
    orgId,
  );
  } // end !presenterMode AR/AP/WIP

  // 5. Fixed assets + depreciation
  await createFixedAsset(
    {
      assetTag: "FA-CNC-01",
      name: "5-axis CNC machining center",
      categoryCode: "GEN",
      acquisitionDate: iso(daysAgo(180)),
      acquisitionCost: 380_000,
      salvageValue: 20_000,
      usefulLifeMonths: 84,
    },
    orgId,
  );

  await createFixedAsset(
    {
      assetTag: "FA-HVAC-02",
      name: "Warehouse HVAC retrofit",
      categoryCode: "GEN",
      acquisitionDate: iso(daysAgo(150)),
      acquisitionCost: 120_000,
      salvageValue: 5_000,
      usefulLifeMonths: 120,
    },
    orgId,
  );

  // 6. Budget plan with WARN + OVER variance rows
  await createBudgetPlan(
    {
      name: `FY${year} Operations (Demo)`,
      fiscalYear: year,
      status: "ACTIVE",
      lineItems: [
        {
          costCenterCode: "COST_CENTER_OPS",
          accountCode: "5000",
          periodYear: year,
          periodMonth: month,
          budgetAmount: 50_000,
          alertThreshold: 0.9,
        },
        {
          costCenterCode: "COST_CENTER_OPS",
          accountCode: "5000",
          periodYear: prevYear,
          periodMonth: prevMonth,
          budgetAmount: 50_000,
          alertThreshold: 0.9,
        },
      ],
    },
    orgId,
  );

  const opsCc = await db.costCenter.findFirst({
    where: { orgId, code: "COST_CENTER_OPS" },
  });
  if (!opsCc) {
    throw new Error("COST_CENTER_OPS missing after budget seed");
  }

  await postJournalWithIntegrity(
    {
      memo: "Demo operations spend — prior month (budget WARN)",
      source: "MANUAL",
      module: "finance-seed",
      reference: "BUD-WARN-DEMO",
      idempotencyKey: "finance-demo-budget-warn",
      entryDate: new Date(prevYear, prevMonth - 1, 20),
      lines: [
        {
          accountCode: "5000",
          debit: 47_500,
          credit: 0,
          costCenterId: opsCc.id,
          description: "Ops spend — 95% of cap",
        },
        { accountCode: "1000", debit: 0, credit: 47_500, description: "Cash disbursement" },
      ],
    },
    orgId,
  );

  await postJournalWithIntegrity(
    {
      memo: "Demo operations spend — current month (budget OVER)",
      source: "MANUAL",
      module: "finance-seed",
      reference: "BUD-OVER-DEMO",
      idempotencyKey: "finance-demo-budget-over",
      entryDate: new Date(year, month - 1, 15),
      lines: [
        {
          accountCode: "5000",
          debit: 52_000,
          credit: 0,
          costCenterId: opsCc.id,
          description: "Ops spend — over cap",
        },
        { accountCode: "1000", debit: 0, credit: 52_000, description: "Cash disbursement" },
      ],
    },
    orgId,
  );

  await runMonthlyDepreciation(year, month, orgId);

  // Standalone cash lines for partial bank matches (not tied to AR/AP payments)
  await postJournalWithIntegrity(
    {
      memo: "Misc customer deposit — demo partial match",
      source: "MANUAL",
      module: "finance-seed",
      reference: "DEP-PARTIAL-A",
      idempotencyKey: "finance-demo-partial-dep-a",
      entryDate: daysAgo(16),
      lines: [
        { accountCode: "1000", debit: 7_500, credit: 0, description: "Unapplied deposit" },
        { accountCode: "3000", debit: 0, credit: 7_500, description: "Misc equity" },
      ],
    },
    orgId,
  );

  await postJournalWithIntegrity(
    {
      memo: "Misc vendor disbursement — demo partial match",
      source: "MANUAL",
      module: "finance-seed",
      reference: "CHK-PARTIAL-B",
      idempotencyKey: "finance-demo-partial-chk-b",
      entryDate: daysAgo(14),
      lines: [
        { accountCode: "2000", debit: 6_500, credit: 0, description: "Misc AP" },
        { accountCode: "1000", debit: 0, credit: 6_500, description: "Check disbursement" },
      ],
    },
    orgId,
  );

  // 7. Bank statement — 12 txns: 6 matched, 2 partial, 4 unmatched
  const stmt = await uploadBankStatement(
    {
      bankAccountCode: "1000",
      statementDate: iso(now),
      periodStart: iso(daysAgo(30)),
      periodEnd: iso(now),
      openingBalance: 792_000,
      closingBalance: 842_000,
      fileName: "demo-statement-1000.csv",
      transactions: [
        { txnDate: iso(daysAgo(28)), amount: 200_000, reference: "DEP-HELION", description: "Helion partial ACH" },
        { txnDate: iso(daysAgo(26)), amount: -20_000, reference: "CHK-WAFERTEK", description: "Wafertek partial" },
        { txnDate: iso(daysAgo(24)), amount: 12_000, reference: "CHK-NORTHWIND", description: "Northwind check" },
        { txnDate: iso(daysAgo(22)), amount: -28_000, reference: "CHK-APEX", description: "Apex steel payment" },
        { txnDate: iso(daysAgo(20)), amount: 8_000, reference: "WIRE-TESSERA", description: "Tessera wire" },
        { txnDate: iso(daysAgo(18)), amount: -10_000, reference: "ACH-MERIDIAN", description: "Meridian partial" },
        { txnDate: iso(daysAgo(16)), amount: 25_000, reference: "DEP-MISC-A", description: "Unapplied deposit (partial match)" },
        { txnDate: iso(daysAgo(14)), amount: -18_000, reference: "CHK-MISC-B", description: "Vendor batch (partial match)" },
        { txnDate: iso(daysAgo(12)), amount: 4_250, reference: "DEP-UNMATCH-1", description: "Unmatched deposit" },
        { txnDate: iso(daysAgo(10)), amount: -3_100, reference: "CHK-UNMATCH-2", description: "Unmatched check" },
        { txnDate: iso(daysAgo(8)), amount: 1_875, reference: "DEP-UNMATCH-3", description: "Unmatched deposit" },
        { txnDate: iso(daysAgo(6)), amount: -2_400, reference: "FEE-UNMATCH-4", description: "Unmatched bank fee" },
      ],
    },
    orgId,
  );

  const txns = stmt.transactions;
  const matchPairs: { txnIdx: number; debit?: number; credit?: number }[] = [
    { txnIdx: 0, debit: 200_000 },
    { txnIdx: 1, credit: 20_000 },
    { txnIdx: 2, debit: 12_000 },
    { txnIdx: 3, credit: 28_000 },
    { txnIdx: 4, debit: 8_000 },
    { txnIdx: 5, credit: 10_000 },
    { txnIdx: 6, debit: 7_500 },
    { txnIdx: 7, credit: 6_500 },
  ];

  for (const pair of matchPairs) {
    const lineId = await findUnmatchedCashLine(orgId, {
      debit: pair.debit,
      credit: pair.credit,
    });
    if (!lineId) continue;
    await manualMatchBankTransaction(
      {
        bankTransactionId: txns[pair.txnIdx].id,
        journalLineIds: [lineId],
        matchedBy: "finance-demo-seed",
        notes: "Demo seed auto-match",
      },
      orgId,
    );
  }

  logger.info("Finance demo transactional data seeded", {
    orgId,
    journalHint: "OB-2026",
    bankStatementId: stmt.id,
    bankTxnCount: txns.length,
    issuedBase: iso(issuedBase),
  });

  return true;
}
