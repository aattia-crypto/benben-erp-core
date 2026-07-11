import { getPrisma } from "../database";
import { getAccountBalance, postJournalEntry } from "./gl.service";
import { ORG_DEFAULT, type JournalLineInput, type PostJournalInput } from "./types";
import { logger } from "../../utils/logger";

const ROUND = (n: number) => Math.round(n * 100) / 100;

function mapAccountType(type: string): string {
  return type.toLowerCase();
}

export async function listJournalEntries(
  filters: {
    from?: string;
    to?: string;
    accountCode?: string;
    source?: string;
    reference?: string;
    limit?: number;
  } = {},
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const where: {
    orgId: string;
    status: string;
    entryDate?: { gte?: Date; lte?: Date };
    source?: string;
    reference?: { contains: string };
    lines?: { some: { accountCode: string } };
  } = { orgId, status: "POSTED" };

  if (filters.from) where.entryDate = { ...where.entryDate, gte: new Date(filters.from) };
  if (filters.to) where.entryDate = { ...where.entryDate, lte: new Date(filters.to) };
  if (filters.source) where.source = filters.source;
  if (filters.reference) where.reference = { contains: filters.reference };
  if (filters.accountCode) where.lines = { some: { accountCode: filters.accountCode } };

  const entries = await db.glJournalEntry.findMany({
    where,
    include: { lines: { orderBy: { accountCode: "asc" } } },
    orderBy: { entryDate: "desc" },
    take: filters.limit ?? 200,
  });

  logger.info("GL listJournalEntries", { count: entries.length, filters });
  return entries;
}

export async function getTrialBalance(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const accounts = await db.glAccount.findMany({
    where: { orgId, isActive: true },
    orderBy: { code: "asc" },
  });

  const rows = [];
  for (const acct of accounts) {
    const agg = await db.glJournalLine.aggregate({
      where: { orgId, accountCode: acct.code, journalEntry: { status: "POSTED" } },
      _sum: { debit: true, credit: true },
    });
    rows.push({
      code: acct.code,
      name: acct.name,
      type: mapAccountType(acct.type),
      debit: ROUND(agg._sum.debit ?? 0),
      credit: ROUND(agg._sum.credit ?? 0),
      balance: ROUND((agg._sum.debit ?? 0) - (agg._sum.credit ?? 0)),
    });
  }
  return rows;
}

export async function getAccountLedger(accountCode: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const account = await db.glAccount.findFirst({ where: { orgId, code: accountCode } });
  if (!account) throw new Error(`Account not found: ${accountCode}`);

  const lines = await db.glJournalLine.findMany({
    where: { orgId, accountCode, journalEntry: { status: "POSTED" } },
    include: {
      journalEntry: {
        select: { id: true, entryDate: true, reference: true, memo: true, source: true },
      },
    },
    orderBy: { journalEntry: { entryDate: "asc" } },
  });

  let running = 0;
  const ledger = lines.map((line) => {
    const delta = ROUND(line.debit - line.credit);
    running = ROUND(running + delta);
    return {
      lineId: line.id,
      journalEntryId: line.journalEntryId,
      entryDate: line.journalEntry.entryDate,
      reference: line.journalEntry.reference,
      memo: line.journalEntry.memo,
      source: line.journalEntry.source,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      runningBalance: running,
    };
  });

  return { account, ledger, endingBalance: running };
}

export async function getBalanceSheet(orgId = ORG_DEFAULT) {
  const tb = await getTrialBalance(orgId);
  const assets = tb.filter((r) => r.type === "asset");
  const liabilities = tb.filter((r) => r.type === "liability");
  const equity = tb.filter((r) => r.type === "equity");
  const sum = (rows: typeof tb, field: "debit" | "credit") =>
    ROUND(rows.reduce((s, r) => s + r[field], 0));

  return {
    asOf: new Date().toISOString().slice(0, 10),
    assets,
    liabilities,
    equity,
    totalAssets: ROUND(assets.reduce((s, r) => s + r.balance, 0)),
    totalLiabilities: ROUND(liabilities.reduce((s, r) => s + Math.abs(r.balance), 0)),
    totalEquity: ROUND(equity.reduce((s, r) => s + r.balance, 0)),
    totals: { debit: sum(tb, "debit"), credit: sum(tb, "credit") },
  };
}

export async function getProfitAndLoss(
  params: { from?: string; to?: string } = {},
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const from = params.from ? new Date(params.from) : new Date(new Date().getFullYear(), 0, 1);
  const to = params.to ? new Date(params.to) : new Date();

  const accounts = await db.glAccount.findMany({
    where: { orgId, type: { in: ["REVENUE", "EXPENSE"] }, isActive: true },
  });

  const rows = [];
  for (const acct of accounts) {
    const agg = await db.glJournalLine.aggregate({
      where: {
        orgId,
        accountCode: acct.code,
        journalEntry: { status: "POSTED", entryDate: { gte: from, lte: to } },
      },
      _sum: { debit: true, credit: true },
    });
    const net = ROUND((agg._sum.credit ?? 0) - (agg._sum.debit ?? 0));
    rows.push({
      code: acct.code,
      name: acct.name,
      type: mapAccountType(acct.type),
      amount: acct.type === "REVENUE" ? net : ROUND(-net),
    });
  }

  const revenue = ROUND(rows.filter((r) => r.type === "revenue").reduce((s, r) => s + r.amount, 0));
  const expense = ROUND(rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0));
  return { from, to, rows, revenue, expense, netIncome: ROUND(revenue - expense) };
}

export async function getChartWithBalances(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const accounts = await db.glAccount.findMany({
    where: { orgId, isActive: true },
    orderBy: { code: "asc" },
  });
  const result = [];
  for (const acct of accounts) {
    const balance = await getAccountBalance(acct.code, orgId);
    result.push({
      code: acct.code,
      name: acct.name,
      type: mapAccountType(acct.type),
      balance,
      currency: acct.currency,
    });
  }
  return result;
}

export async function createJournalEntryViaApi(
  input: {
    memo: string;
    lines: JournalLineInput[];
    source?: string;
    reference?: string;
    entryDate?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const payload: PostJournalInput = {
    entryDate: input.entryDate ? new Date(input.entryDate) : new Date(),
    memo: input.memo,
    reference: input.reference,
    source: (input.source ?? "MANUAL").toUpperCase(),
    lines: input.lines,
  };
  const entry = await postJournalEntry(payload, orgId);
  logger.info("GL createJournalEntryViaApi", { id: entry.id, lineCount: input.lines.length });
  const full = await getPrisma().glJournalEntry.findUnique({
    where: { id: entry.id },
    include: { lines: true },
  });
  return full;
}

export async function reverseJournalEntry(entryId: string, orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const original = await db.glJournalEntry.findFirst({
    where: { id: entryId, orgId },
    include: { lines: true },
  });
  if (!original) throw new Error("Journal entry not found.");

  const lines: JournalLineInput[] = original.lines.map((l) => ({
    accountCode: l.accountCode,
    debit: l.credit,
    credit: l.debit,
    description: l.description ? `Reversal: ${l.description}` : "Reversal",
  }));

  return createJournalEntryViaApi(
    {
      memo: `Reversal of ${original.reference ?? original.id}: ${original.memo ?? ""}`,
      source: "MANUAL",
      reference: `REV-${original.reference ?? original.id.slice(0, 8)}`,
      lines,
    },
    orgId,
  );
}
