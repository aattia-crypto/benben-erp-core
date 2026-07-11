import { getPrisma } from "../database";
import { logActivity } from "../audit.service";
import { logger } from "../../utils/logger";
import { postJournalWithIntegrity } from "./journal-post.service";
import { ORG_DEFAULT } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export type ArLineInput = {
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type CreateArInvoiceInput = {
  customerCode: string;
  customerName: string;
  lines: ArLineInput[];
  subtotal: number;
  tax: number;
  shipping?: number;
  discount?: number;
  terms?: string;
  issuedAt: string;
  dueAt: string;
  source?: string;
  sourceRef?: string;
  postGl?: boolean;
  idempotencyKey?: string;
};

function nextInvoiceNumber(orgId: string, count: number): string {
  return `AR-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

export async function createArInvoice(input: CreateArInvoiceInput, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const total = ROUND(input.subtotal + input.tax + (input.shipping ?? 0) - (input.discount ?? 0));
  const count = await db.arInvoice.count({ where: { orgId } });

  let journalEntryId: string | undefined;
  if (input.postGl !== false) {
    const lines = [
      { accountCode: "1100", debit: total, credit: 0, description: `AR ${input.customerCode}` },
      { accountCode: "4000", debit: 0, credit: input.subtotal, description: "Revenue" },
    ];
    if (input.tax > 0) {
      lines.push({ accountCode: "2100", debit: 0, credit: input.tax, description: "Sales tax" });
    }
    const posted = await postJournalWithIntegrity({
      memo: `AR Invoice ${input.sourceRef ?? input.customerCode}`,
      lines,
      source: "AR",
      module: "ar",
      reference: input.sourceRef,
      idempotencyKey: input.idempotencyKey ?? `ar-inv-${input.sourceRef ?? input.customerCode}-${total}`,
    });
    journalEntryId = posted.id;
  }

  const inv = await db.arInvoice.create({
    data: {
      orgId,
      invoiceNumber: nextInvoiceNumber(orgId, count),
      customerCode: input.customerCode,
      customerName: input.customerName,
      linesJson: JSON.stringify(input.lines),
      subtotal: input.subtotal,
      tax: input.tax,
      shipping: input.shipping ?? 0,
      discount: input.discount ?? 0,
      total,
      amountPaid: 0,
      balance: total,
      status: "OPEN",
      terms: input.terms,
      issuedAt: new Date(input.issuedAt),
      dueAt: new Date(input.dueAt),
      source: input.source,
      sourceRef: input.sourceRef,
      journalEntryId,
    },
  });

  await logActivity({
    module: "ar",
    action: "INVOICE_CREATED",
    entityType: "ArInvoice",
    entityId: inv.id,
    summary: `${inv.invoiceNumber} · ${input.customerName}`,
    afterJson: JSON.stringify({ total, customerCode: input.customerCode }),
  });

  logger.info("AR invoice created", { id: inv.id, invoiceNumber: inv.invoiceNumber });
  return inv;
}

export async function applyArPayment(
  input: {
    customerCode: string;
    amount: number;
    allocations: { invoiceId: string; amount: number }[];
    method: string;
    memo?: string;
    postGl?: boolean;
    idempotencyKey?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  let remaining = input.amount;
  let journalEntryId: string | undefined;

  if (input.postGl !== false) {
    const posted = await postJournalWithIntegrity({
      memo: input.memo ?? `Payment from ${input.customerCode}`,
      lines: [
        { accountCode: "1000", debit: input.amount, credit: 0 },
        { accountCode: "1100", debit: 0, credit: input.amount },
      ],
      source: "AR",
      module: "ar",
      idempotencyKey: input.idempotencyKey ?? `ar-pay-${input.customerCode}-${input.amount}-${Date.now()}`,
    });
    journalEntryId = posted.id;
  }

  const payment = await db.arPayment.create({
    data: {
      orgId,
      customerCode: input.customerCode,
      amount: input.amount,
      unapplied: 0,
      method: input.method,
      paidAt: new Date(),
      memo: input.memo,
      journalEntryId,
    },
  });

  for (const alloc of input.allocations) {
    const applied = ROUND(Math.min(alloc.amount, remaining));
    if (applied <= 0) continue;
    const inv = await db.arInvoice.findFirst({ where: { id: alloc.invoiceId, orgId } });
    if (!inv) continue;
    const newPaid = ROUND(inv.amountPaid + applied);
    const balance = ROUND(Math.max(0, inv.total - newPaid));
    const status = balance <= 0.01 ? "PAID" : "PARTIAL";
    await db.arInvoice.update({
      where: { id: inv.id },
      data: { amountPaid: newPaid, balance, status },
    });
    await db.arPaymentAllocation.create({
      data: { orgId, paymentId: payment.id, invoiceId: inv.id, amount: applied },
    });
    remaining = ROUND(remaining - applied);
  }

  await db.arPayment.update({
    where: { id: payment.id },
    data: { unapplied: Math.max(0, remaining) },
  });

  await logActivity({
    module: "ar",
    action: "PAYMENT_APPLIED",
    entityType: "ArPayment",
    entityId: payment.id,
    summary: `$${input.amount} from ${input.customerCode}`,
  });

  return payment;
}

export async function listArInvoices(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  return db.arInvoice.findMany({
    where: { orgId },
    include: { allocations: true },
    orderBy: { issuedAt: "desc" },
  });
}

export async function getArAging(orgId = ORG_DEFAULT) {
  const invoices = await listArInvoices(orgId);
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const now = Date.now();
  for (const inv of invoices) {
    if (inv.balance <= 0 || inv.status === "VOID" || inv.status === "PAID") continue;
    const days = Math.floor((now - inv.dueAt.getTime()) / 86_400_000);
    if (days <= 0) buckets.current += inv.balance;
    else if (days <= 30) buckets.d30 += inv.balance;
    else if (days <= 60) buckets.d60 += inv.balance;
    else if (days <= 90) buckets.d90 += inv.balance;
    else buckets.d90plus += inv.balance;
  }
  return buckets;
}

export async function createArCreditMemo(
  input: {
    customerCode: string;
    amount: number;
    reason: string;
    invoiceId?: string;
    idempotencyKey?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const amount = ROUND(input.amount);
  if (amount <= 0) throw new Error("Credit amount must be positive");

  const posted = await postJournalWithIntegrity({
    memo: `AR Credit · ${input.reason}`,
    lines: [
      { accountCode: "4000", debit: amount, credit: 0, description: "Credit memo" },
      { accountCode: "1100", debit: 0, credit: amount, description: input.customerCode },
    ],
    source: "AR",
    module: "ar",
    reference: input.invoiceId,
    idempotencyKey: input.idempotencyKey ?? `ar-cm-${input.customerCode}-${amount}-${input.invoiceId ?? "open"}`,
  });

  const memo = await db.arCreditMemo.create({
    data: {
      orgId,
      customerCode: input.customerCode,
      invoiceId: input.invoiceId,
      amount,
      reason: input.reason,
      journalEntryId: posted.id,
    },
  });

  if (input.invoiceId) {
    const inv = await db.arInvoice.findFirst({ where: { id: input.invoiceId, orgId } });
    if (inv) {
      const balance = ROUND(Math.max(0, inv.balance - amount));
      const status = balance <= 0.01 ? "PAID" : inv.status === "OPEN" ? "PARTIAL" : inv.status;
      await db.arInvoice.update({
        where: { id: inv.id },
        data: { balance, status },
      });
    }
  }

  await logActivity({
    module: "ar",
    action: "CREDIT_MEMO",
    entityType: "ArCreditMemo",
    entityId: memo.id,
    summary: `$${amount} · ${input.customerCode}`,
  });

  return memo;
}

export async function getArInvoiceDetail(invoiceId: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const invoice = await db.arInvoice.findFirst({
    where: { id: invoiceId, orgId },
    include: {
      journalEntry: { include: { lines: true } },
      creditMemos: true,
      allocations: { include: { payment: { include: { journalEntry: true } } } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  return invoice;
}

export async function getCustomerLedger(customerCode: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const invoices = await db.arInvoice.findMany({
    where: { orgId, customerCode },
    orderBy: { issuedAt: "desc" },
  });
  const payments = await db.arPayment.findMany({
    where: { orgId, customerCode },
    include: { allocations: true },
    orderBy: { paidAt: "desc" },
  });
  const credits = await db.arCreditMemo.findMany({
    where: { orgId, customerCode },
    orderBy: { creditedAt: "desc" },
  });
  const balance = invoices
    .filter((i) => i.status !== "VOID" && i.status !== "PAID")
    .reduce((s, i) => s + i.balance, 0);
  return { invoices, payments, credits, balance: ROUND(balance) };
}
