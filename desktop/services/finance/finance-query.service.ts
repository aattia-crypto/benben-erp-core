import { getPrisma } from "../database";
import { getBudgetVarianceReport } from "./budget.service";
import { getTaxSummaryReport } from "./tax.service";
import { ORG_DEFAULT } from "./types";
import { logger } from "../../utils/logger";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export async function listBankTransactions(
  filters: { matchStatus?: string; statementId?: string } = {},
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const txs = await db.bankTransaction.findMany({
    where: {
      orgId,
      matchStatus: filters.matchStatus,
      bankStatementId: filters.statementId,
    },
    include: {
      bankStatement: { select: { id: true, bankAccountCode: true, statementDate: true } },
      reconciliationLogs: true,
    },
    orderBy: { txnDate: "desc" },
    take: 500,
  });
  logger.info("listBankTransactions", { count: txs.length });
  return txs;
}

export async function listFixedAssets(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  return db.fixedAsset.findMany({
    where: { orgId },
    include: { category: true, schedules: { orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }], take: 12 } },
    orderBy: { acquisitionDate: "desc" },
  });
}

export async function listBudgetPlans(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  return db.budgetPlan.findMany({
    where: { orgId },
    include: { lineItems: { include: { costCenter: true } } },
    orderBy: { fiscalYear: "desc" },
  });
}

export async function listFxRevaluations(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const runs = await db.consolidationRun.findMany({
    where: { orgId },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take: 24,
  });
  const rates = await db.currencyExchangeRate.findMany({
    where: { orgId },
    orderBy: { rateDate: "desc" },
    take: 50,
  });
  return { consolidationRuns: runs, exchangeRates: rates };
}

export async function getFinanceDashboard(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const from = new Date(year, month - 1, 1).toISOString();
  const to = now.toISOString();

  const [
    recentEntries,
    cashBalance,
    unmatchedBank,
    partialBank,
    depreciationRuns,
    consolidationRuns,
    taxSummary,
    variance,
  ] = await Promise.all([
    db.glJournalEntry.findMany({
      where: { orgId, status: "POSTED" },
      include: { lines: true },
      orderBy: { entryDate: "desc" },
      take: 10,
    }),
    db.glJournalLine.aggregate({
      where: { orgId, accountCode: "1000", journalEntry: { status: "POSTED" } },
      _sum: { debit: true, credit: true },
    }),
    db.bankTransaction.count({ where: { orgId, matchStatus: "UNMATCHED" } }),
    db.bankTransaction.count({ where: { orgId, matchStatus: "PARTIALLY_MATCHED" } }),
    db.depreciationRun.findMany({
      where: { orgId },
      orderBy: [{ runYear: "desc" }, { runMonth: "desc" }],
      take: 6,
    }),
    db.consolidationRun.findMany({
      where: { orgId },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take: 6,
    }),
    getTaxSummaryReport({
      from: new Date(year, 0, 1).toISOString().slice(0, 10),
      to: to.slice(0, 10),
    }).catch(() => null),
    getBudgetVarianceReport({ fiscalYear: year }).catch(() => null),
  ]);

  const cash = ROUND((cashBalance._sum.debit ?? 0) - (cashBalance._sum.credit ?? 0));
  const overBudget =
    variance?.rows?.filter((r: { status: string }) => r.status === "OVER").length ?? 0;
  const warnBudget =
    variance?.rows?.filter((r: { status: string }) => r.status === "WARN").length ?? 0;

  return {
    generatedAt: now.toISOString(),
    cashBalance: cash,
    recentEntries,
    bankReconciliation: {
      unmatched: unmatchedBank,
      partial: partialBank,
    },
    depreciationRuns,
    consolidationRuns,
    taxSummary,
    budgetVariance: variance
      ? { overCount: overBudget, warnCount: warnBudget, rows: variance.rows?.slice(0, 8) }
      : null,
  };
}
