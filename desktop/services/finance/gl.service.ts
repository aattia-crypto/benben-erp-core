import type { Prisma } from "@prisma/client";

import { getPrisma } from "../database";
import { logger } from "../../utils/logger";
import { ORG_DEFAULT, type JournalLineInput, type PostJournalInput } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export const DEFAULT_CHART = [
  { code: "1000", name: "Cash", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "1210", name: "Work-In-Process (WIP)", type: "ASSET" },
  { code: "1500", name: "Fixed Assets", type: "ASSET" },
  { code: "1510", name: "Accumulated Depreciation", type: "ASSET" },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "Sales Tax Payable", type: "LIABILITY" },
  { code: "2200", name: "Deferred Revenue", type: "LIABILITY" },
  { code: "2210", name: "Unrealized FX Gain/Loss", type: "LIABILITY" },
  { code: "3000", name: "Equity", type: "EQUITY" },
  { code: "4000", name: "Revenue", type: "REVENUE" },
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE" },
  { code: "6100", name: "Depreciation Expense", type: "EXPENSE" },
  { code: "6200", name: "Intercompany Clearing", type: "EXPENSE" },
] as const;

export function validateJournalLines(lines: JournalLineInput[]): void {
  if (!lines.length) {
    throw new Error("Journal entry requires at least one line.");
  }
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    const debit = ROUND(line.debit ?? 0);
    const credit = ROUND(line.credit ?? 0);
    if (debit < 0 || credit < 0) {
      throw new Error("Debit and credit amounts must be non-negative.");
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`Account ${line.accountCode}: line cannot have both debit and credit.`);
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Account ${line.accountCode}: line must have debit or credit.`);
    }
    totalDebit += debit;
    totalCredit += credit;
  }
  if (ROUND(totalDebit) !== ROUND(totalCredit)) {
    throw new Error(
      `Journal entry is not balanced (debits ${totalDebit}, credits ${totalCredit}).`,
    );
  }
}

export async function ensureDefaultChartOfAccounts(orgId = ORG_DEFAULT): Promise<void> {
  const db = getPrisma();
  for (const acct of DEFAULT_CHART) {
    await db.glAccount.upsert({
      where: { orgId_code: { orgId, code: acct.code } },
      create: {
        orgId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        currency: "USD",
      },
      update: { name: acct.name, type: acct.type },
    });
  }
}

export async function postJournalEntry(
  input: PostJournalInput,
  orgId = ORG_DEFAULT,
): Promise<{ id: string; entryDate: Date }> {
  validateJournalLines(input.lines);
  const db = getPrisma();

  const codes = [...new Set(input.lines.map((l) => l.accountCode))];
  const existing = await db.glAccount.findMany({
    where: { orgId, code: { in: codes } },
    select: { code: true },
  });
  const found = new Set(existing.map((a) => a.code));
  const missing = codes.filter((c) => !found.has(c));
  if (missing.length) {
    throw new Error(`Unknown GL account codes: ${missing.join(", ")}`);
  }

  logger.info("GL postJournalEntry", {
    source: input.source,
    lineCount: input.lines.length,
    reference: input.reference,
  });

  const entry = await db.glJournalEntry.create({
    data: {
      orgId,
      entryDate: input.entryDate,
      reference: input.reference,
      memo: input.memo,
      source: input.source,
      currency: input.currency ?? "USD",
      status: "POSTED",
      lines: {
        create: input.lines.map((line) => ({
          orgId,
          accountCode: line.accountCode,
          description: line.description,
          debit: ROUND(line.debit ?? 0),
          credit: ROUND(line.credit ?? 0),
          currency: line.currency ?? input.currency ?? "USD",
          amountFx: line.amountFx,
          fxRate: line.fxRate,
          costCenterId: line.costCenterId,
        })),
      },
    },
    include: { lines: true },
  });

  return { id: entry.id, entryDate: entry.entryDate };
}

export async function getAccountBalance(
  accountCode: string,
  orgId = ORG_DEFAULT,
): Promise<number> {
  const db = getPrisma();
  const agg = await db.glJournalLine.aggregate({
    where: { orgId, accountCode, journalEntry: { status: "POSTED" } },
    _sum: { debit: true, credit: true },
  });
  return ROUND((agg._sum.debit ?? 0) - (agg._sum.credit ?? 0));
}

export interface LedgerCandidate {
  journalLineId: string;
  journalEntryId: string;
  entryDate: Date;
  accountCode: string;
  amount: number;
  reference: string | null;
  description: string | null;
}

/** GL lines on cash/bank accounts suitable for bank reconciliation matching. */
export async function findBankMatchCandidates(
  params: {
    bankAccountCode: string;
    amount: number;
    txnDate: Date;
    reference?: string | null;
    checkNumber?: string | null;
    dateToleranceDays: number;
    amountTolerance: number;
    excludeLineIds?: string[];
  },
  orgId = ORG_DEFAULT,
): Promise<LedgerCandidate[]> {
  const db = getPrisma();
  const dayMs = 86400000;
  const from = new Date(params.txnDate.getTime() - params.dateToleranceDays * dayMs);
  const to = new Date(params.txnDate.getTime() + params.dateToleranceDays * dayMs);
  const targetAmount = ROUND(Math.abs(params.amount));

  const lines = await db.glJournalLine.findMany({
    where: {
      orgId,
      accountCode: params.bankAccountCode,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: from, lte: to },
      },
      id: params.excludeLineIds?.length
        ? { notIn: params.excludeLineIds }
        : undefined,
      reconciliationLogs: { none: {} },
    },
    include: {
      journalEntry: { select: { id: true, entryDate: true, reference: true } },
    },
  });

  const refNeedle = normalizeRef(params.reference ?? params.checkNumber);

  const scored: { line: (typeof lines)[0]; score: number }[] = [];

  for (const line of lines) {
    const lineAmount = ROUND(Math.abs(line.debit - line.credit));
    if (Math.abs(lineAmount - targetAmount) > params.amountTolerance) continue;

    let score = 10;
    if (Math.abs(lineAmount - targetAmount) < 0.01) score += 20;

    const entryRef = normalizeRef(line.journalEntry.reference);
    if (refNeedle && entryRef && (entryRef.includes(refNeedle) || refNeedle.includes(entryRef))) {
      score += 30;
    }
    if (line.description && refNeedle && normalizeRef(line.description).includes(refNeedle)) {
      score += 10;
    }

    scored.push({ line, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.map(({ line }) => ({
    journalLineId: line.id,
    journalEntryId: line.journalEntryId,
    entryDate: line.journalEntry.entryDate,
    accountCode: line.accountCode,
    amount: ROUND(line.debit - line.credit),
    reference: line.journalEntry.reference,
    description: line.description,
  }));
}

function normalizeRef(value?: string | null): string {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export async function sumExpensesByCostCenter(
  costCenterId: string,
  accountCode: string,
  periodYear: number,
  periodMonth: number,
  orgId = ORG_DEFAULT,
): Promise<number> {
  const db = getPrisma();
  const start = new Date(periodYear, periodMonth - 1, 1);
  const end = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);

  const lines = await db.glJournalLine.findMany({
    where: {
      orgId,
      costCenterId,
      accountCode,
      journalEntry: {
        status: "POSTED",
        entryDate: { gte: start, lte: end },
      },
    },
    select: { debit: true, credit: true },
  });

  return ROUND(lines.reduce((sum, l) => sum + l.debit - l.credit, 0));
}

export type GlJournalEntryWithLines = Prisma.GlJournalEntryGetPayload<{
  include: { lines: true };
}>;
