import { getPrisma } from "../database";
import { logActivity } from "../audit.service";
import { logger } from "../../utils/logger";
import { postJournalWithIntegrity } from "./journal-post.service";
import { validateBudgetAvailability } from "./budget.service";
import { ORG_DEFAULT } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export type ApLineInput = {
  sku?: string;
  description: string;
  qty: number;
  unitCost: number;
  expenseAccount?: string;
};

export type CreateApBillInput = {
  vendorCode: string;
  vendorName: string;
  poId?: string;
  lines: ApLineInput[];
  subtotal: number;
  tax: number;
  total: number;
  billDate: string;
  dueDate: string;
  postGl?: boolean;
  idempotencyKey?: string;
};

export async function createApBill(input: CreateApBillInput, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const count = await db.apBill.count({ where: { orgId } });
  const billNumber = `BILL-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  let journalEntryId: string | undefined;
  if (input.postGl !== false) {
    const posted = await postJournalWithIntegrity({
      memo: `AP Bill ${billNumber} · ${input.vendorName}`,
      lines: [
        { accountCode: "5000", debit: input.total, credit: 0 },
        { accountCode: "2000", debit: 0, credit: input.total },
      ],
      source: "AP",
      module: "ap",
      reference: billNumber,
      idempotencyKey: input.idempotencyKey ?? `ap-bill-${billNumber}`,
    });
    journalEntryId = posted.id;
  }

  const bill = await db.apBill.create({
    data: {
      orgId,
      billNumber,
      vendorCode: input.vendorCode,
      vendorName: input.vendorName,
      poId: input.poId,
      linesJson: JSON.stringify(input.lines),
      subtotal: input.subtotal,
      tax: input.tax,
      total: input.total,
      amountPaid: 0,
      balance: input.total,
      status: "OPEN",
      billDate: new Date(input.billDate),
      dueDate: new Date(input.dueDate),
      journalEntryId,
    },
  });

  await logActivity({
    module: "ap",
    action: "BILL_CREATED",
    entityType: "ApBill",
    entityId: bill.id,
    summary: `${billNumber} · ${input.vendorName}`,
  });

  logger.info("AP bill created", { id: bill.id, billNumber });
  return bill;
}

export async function payApBill(
  input: {
    billId: string;
    amount: number;
    method: string;
    memo?: string;
    idempotencyKey?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const bill = await db.apBill.findFirst({ where: { id: input.billId, orgId } });
  if (!bill) throw new Error("Bill not found");

  const applied = ROUND(Math.min(input.amount, bill.balance));
  const posted = await postJournalWithIntegrity({
    memo: input.memo ?? `Payment ${bill.billNumber}`,
    lines: [
      { accountCode: "2000", debit: applied, credit: 0 },
      { accountCode: "1000", debit: 0, credit: applied },
    ],
    source: "AP",
    module: "ap",
    reference: bill.billNumber,
    idempotencyKey: input.idempotencyKey ?? `ap-pay-${bill.id}-${applied}`,
  });

  const payment = await db.apPayment.create({
    data: {
      orgId,
      vendorCode: bill.vendorCode,
      amount: applied,
      method: input.method,
      paidAt: new Date(),
      memo: input.memo,
      journalEntryId: posted.id,
    },
  });

  const newPaid = ROUND(bill.amountPaid + applied);
  const balance = ROUND(Math.max(0, bill.total - newPaid));
  await db.apBill.update({
    where: { id: bill.id },
    data: {
      amountPaid: newPaid,
      balance,
      status: balance <= 0.01 ? "PAID" : "PARTIAL",
    },
  });

  await db.apPaymentAllocation.create({
    data: { orgId, paymentId: payment.id, billId: bill.id, amount: applied },
  });

  await logActivity({
    module: "ap",
    action: "BILL_PAID",
    entityType: "ApPayment",
    entityId: payment.id,
    summary: `$${applied} · ${bill.billNumber}`,
  });

  return { payment, bill };
}

export async function listApBills(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  return db.apBill.findMany({
    where: { orgId },
    include: { allocations: true },
    orderBy: { billDate: "desc" },
  });
}

export async function getApAging(orgId = ORG_DEFAULT) {
  const bills = await listApBills(orgId);
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const now = Date.now();
  for (const b of bills) {
    if (b.balance <= 0 || b.status === "VOID" || b.status === "PAID") continue;
    const days = Math.floor((now - b.dueDate.getTime()) / 86_400_000);
    if (days <= 0) buckets.current += b.balance;
    else if (days <= 30) buckets.d30 += b.balance;
    else if (days <= 60) buckets.d60 += b.balance;
    else if (days <= 90) buckets.d90 += b.balance;
    else buckets.d90plus += b.balance;
  }
  return buckets;
}

export async function createApVendorCredit(
  input: {
    vendorCode: string;
    amount: number;
    reason: string;
    billId?: string;
    idempotencyKey?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const amount = ROUND(input.amount);
  if (amount <= 0) throw new Error("Credit amount must be positive");

  const posted = await postJournalWithIntegrity({
    memo: `AP Vendor credit · ${input.reason}`,
    lines: [
      { accountCode: "2000", debit: amount, credit: 0, description: input.vendorCode },
      { accountCode: "5000", debit: 0, credit: amount, description: "Vendor credit" },
    ],
    source: "AP",
    module: "ap",
    reference: input.billId,
    idempotencyKey: input.idempotencyKey ?? `ap-vc-${input.vendorCode}-${amount}-${input.billId ?? "open"}`,
  });

  const credit = await db.apVendorCredit.create({
    data: {
      orgId,
      vendorCode: input.vendorCode,
      billId: input.billId,
      amount,
      reason: input.reason,
      journalEntryId: posted.id,
    },
  });

  if (input.billId) {
    const bill = await db.apBill.findFirst({ where: { id: input.billId, orgId } });
    if (bill) {
      const balance = ROUND(Math.max(0, bill.balance - amount));
      const status = balance <= 0.01 ? "PAID" : bill.status === "OPEN" ? "PARTIAL" : bill.status;
      await db.apBill.update({
        where: { id: bill.id },
        data: { balance, status },
      });
    }
  }

  await logActivity({
    module: "ap",
    action: "VENDOR_CREDIT",
    entityType: "ApVendorCredit",
    entityId: credit.id,
    summary: `$${amount} · ${input.vendorCode}`,
  });

  return credit;
}

export async function getApBillDetail(billId: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const bill = await db.apBill.findFirst({
    where: { id: billId, orgId },
    include: {
      journalEntry: { include: { lines: true } },
      credits: true,
      allocations: { include: { payment: { include: { journalEntry: true } } } },
    },
  });
  if (!bill) throw new Error("Bill not found");
  return bill;
}

export async function getVendorLedger(vendorCode: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const code = vendorCode.trim().toUpperCase();
  const bills = await db.apBill.findMany({
    where: { orgId, vendorCode: code },
    orderBy: { billDate: "desc" },
  });
  const payments = await db.apPayment.findMany({
    where: { orgId, vendorCode: code },
    include: { allocations: true },
    orderBy: { paidAt: "desc" },
  });
  const credits = await db.apVendorCredit.findMany({
    where: { orgId, vendorCode: code },
    orderBy: { creditedAt: "desc" },
  });
  const balance = bills
    .filter((b) => b.status !== "VOID" && b.status !== "PAID")
    .reduce((s, b) => s + b.balance, 0);
  return { bills, payments, credits, balance: ROUND(balance) };
}

const DEFAULT_AP_COST_CENTER = "COST_CENTER_OPS";
const DEFAULT_AP_EXPENSE_ACCOUNT = "5000";

/**
 * AP approval gate — validates remaining budget cap and returns a warning when exceeded.
 */
export async function approveApBill(
  billId: string,
  options?: { costCenterCode?: string; accountCode?: string },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const bill = await db.apBill.findFirst({ where: { id: billId, orgId } });
  if (!bill) throw new Error("Bill not found.");
  if (bill.status === "VOID" || bill.status === "PAID") {
    throw new Error(`Bill ${bill.billNumber} cannot be approved in status ${bill.status}.`);
  }

  const now = new Date();
  const budgetCheck = await validateBudgetAvailability(
    {
      costCenterCode: options?.costCenterCode ?? DEFAULT_AP_COST_CENTER,
      accountCode: options?.accountCode ?? DEFAULT_AP_EXPENSE_ACCOUNT,
      amount: bill.total,
      periodYear: now.getFullYear(),
      periodMonth: now.getMonth() + 1,
      mode: "WARN_ONLY",
    },
    orgId,
  );

  const updated = await db.apBill.update({
    where: { id: bill.id },
    data: { status: "APPROVED" },
  });

  await logActivity({
    module: "ap",
    action: "BILL_APPROVED",
    entityType: "ApBill",
    entityId: bill.id,
    summary: `${bill.billNumber} · budget: ${budgetCheck.message}`,
  });

  const budgetWarning =
    budgetCheck.message.includes("Over budget") || budgetCheck.message.includes("Approaching")
      ? budgetCheck.message
      : null;

  return { bill: updated, budgetCheck, budgetWarning };
}
