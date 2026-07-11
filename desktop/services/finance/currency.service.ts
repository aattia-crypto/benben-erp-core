import { getPrisma } from "../database";
import { getAccountBalance, postJournalEntry } from "./gl.service";
import { ORG_DEFAULT } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export interface ExchangeRateUpdateInput {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateDate: string;
  source?: string;
}

export async function updateExchangeRates(
  rates: ExchangeRateUpdateInput[],
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const results = [];
  for (const r of rates) {
    const row = await db.currencyExchangeRate.upsert({
      where: {
        orgId_fromCurrency_toCurrency_rateDate: {
          orgId,
          fromCurrency: r.fromCurrency,
          toCurrency: r.toCurrency,
          rateDate: new Date(r.rateDate),
        },
      },
      create: {
        orgId,
        fromCurrency: r.fromCurrency,
        toCurrency: r.toCurrency,
        rate: r.rate,
        rateDate: new Date(r.rateDate),
        source: r.source ?? "MANUAL",
      },
      update: { rate: r.rate, source: r.source ?? "MANUAL" },
    });
    results.push(row);
  }
  return results;
}

export async function getLatestRate(
  fromCurrency: string,
  toCurrency: string,
  asOf: Date,
  orgId = ORG_DEFAULT,
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;
  const db = getPrisma();
  const direct = await db.currencyExchangeRate.findFirst({
    where: {
      orgId,
      fromCurrency,
      toCurrency,
      rateDate: { lte: asOf },
    },
    orderBy: { rateDate: "desc" },
  });
  if (direct) return direct.rate;

  const inverse = await db.currencyExchangeRate.findFirst({
    where: {
      orgId,
      fromCurrency: toCurrency,
      toCurrency: fromCurrency,
      rateDate: { lte: asOf },
    },
    orderBy: { rateDate: "desc" },
  });
  if (inverse && inverse.rate !== 0) return ROUND(1 / inverse.rate);

  throw new Error(`No exchange rate for ${fromCurrency}/${toCurrency}`);
}

async function revalueForeignBalances(
  periodYear: number,
  periodMonth: number,
  functionalCurrency: string,
  orgId: string,
): Promise<{ journalEntryId?: string; adjustments: { accountCode: string; gainLoss: number }[] }> {
  const db = getPrisma();
  const asOf = new Date(periodYear, periodMonth, 0);
  const accounts = await db.glAccount.findMany({
    where: { orgId, currency: { not: functionalCurrency }, isActive: true },
  });

  const adjustments: { accountCode: string; gainLoss: number }[] = [];
  const lines: { accountCode: string; debit?: number; credit?: number; description?: string }[] =
    [];

  for (const acct of accounts) {
    const balanceFx = await getAccountBalance(acct.code, orgId);
    if (Math.abs(balanceFx) < 0.01) continue;

    const rate = await getLatestRate(acct.currency, functionalCurrency, asOf, orgId);
    const balanceFunctional = ROUND(balanceFx * rate);
    const storedFunctional = balanceFx; // simplified: assume book kept in FX until reval
    const gainLoss = ROUND(balanceFunctional - storedFunctional);
    if (Math.abs(gainLoss) < 0.01) continue;

    adjustments.push({ accountCode: acct.code, gainLoss });

    if (gainLoss > 0) {
      lines.push({
        accountCode: acct.code,
        debit: gainLoss,
        description: `FX revaluation ${acct.currency}`,
      });
      lines.push({
        accountCode: "2210",
        credit: gainLoss,
        description: "Unrealized FX gain",
      });
    } else {
      const loss = Math.abs(gainLoss);
      lines.push({
        accountCode: "2210",
        debit: loss,
        description: "Unrealized FX loss",
      });
      lines.push({
        accountCode: acct.code,
        credit: loss,
        description: `FX revaluation ${acct.currency}`,
      });
    }
  }

  if (!lines.length) return { adjustments: [] };

  const entry = await postJournalEntry(
    {
      entryDate: asOf,
      reference: `FX-REVAL-${periodYear}${String(periodMonth).padStart(2, "0")}`,
      memo: "Month-end foreign currency revaluation",
      source: "FX_REVAL",
      currency: functionalCurrency,
      lines,
    },
    orgId,
  );

  return { journalEntryId: entry.id, adjustments };
}

async function eliminateIntercompanyBalances(
  periodYear: number,
  periodMonth: number,
  orgId: string,
): Promise<{ journalEntryId?: string; eliminatedCount: number }> {
  const db = getPrisma();
  const pending = await db.intercompanyJournalEntry.findMany({
    where: { orgId, periodYear, periodMonth, eliminated: false },
  });

  if (!pending.length) {
    return { eliminatedCount: 0 };
  }

  const total = ROUND(pending.reduce((s, p) => s + p.amount, 0));
  const entry = await postJournalEntry(
    {
      entryDate: new Date(periodYear, periodMonth - 1, 28),
      reference: `IC-ELIM-${periodYear}${String(periodMonth).padStart(2, "0")}`,
      memo: "Intercompany elimination entries",
      source: "CONSOLIDATION",
      lines: [
        {
          accountCode: "6200",
          debit: total,
          description: "Clear intercompany receivable",
        },
        {
          accountCode: "2000",
          credit: total,
          description: "Clear intercompany payable",
        },
      ],
    },
    orgId,
  );

  await db.intercompanyJournalEntry.updateMany({
    where: { orgId, periodYear, periodMonth, eliminated: false },
    data: { eliminated: true, toJournalEntryId: entry.id },
  });

  return { journalEntryId: entry.id, eliminatedCount: pending.length };
}

export async function runConsolidation(
  params: {
    periodYear: number;
    periodMonth: number;
    parentEntityCode?: string;
    functionalCurrency?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const functionalCurrency = params.functionalCurrency ?? "USD";

  const fx = await revalueForeignBalances(
    params.periodYear,
    params.periodMonth,
    functionalCurrency,
    orgId,
  );

  const elim = await eliminateIntercompanyBalances(
    params.periodYear,
    params.periodMonth,
    orgId,
  );

  const run = await db.consolidationRun.upsert({
    where: {
      orgId_periodYear_periodMonth: {
        orgId,
        periodYear: params.periodYear,
        periodMonth: params.periodMonth,
      },
    },
    create: {
      orgId,
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      parentEntityCode: params.parentEntityCode ?? "PARENT",
      eliminationEntryId: elim.journalEntryId,
      fxRevaluationEntryId: fx.journalEntryId,
      status: "COMPLETED",
    },
    update: {
      eliminationEntryId: elim.journalEntryId,
      fxRevaluationEntryId: fx.journalEntryId,
      status: "COMPLETED",
    },
  });

  return { run, fxRevaluation: fx, intercompanyElimination: elim };
}

/** Applies input FX rate, scans foreign ledger balances, runs consolidation, returns net balance. */
export async function runConsolidationWithFxReport(
  params: {
    periodYear: number;
    periodMonth: number;
    fxRate: number;
    fromCurrency?: string;
    functionalCurrency?: string;
    parentEntityCode?: string;
  },
  orgId = ORG_DEFAULT,
) {
  const functionalCurrency = params.functionalCurrency ?? "USD";
  const fromCurrency = params.fromCurrency ?? "EUR";
  const rateDate = new Date(params.periodYear, params.periodMonth - 1, 28)
    .toISOString()
    .slice(0, 10);

  await updateExchangeRates(
    [{ fromCurrency, toCurrency: functionalCurrency, rate: params.fxRate, rateDate }],
    orgId,
  );

  const db = getPrisma();
  const foreignAccounts = await db.glAccount.findMany({
    where: { orgId, currency: { not: functionalCurrency }, isActive: true },
  });

  const foreignBalances: { accountCode: string; currency: string; balanceFx: number; balanceFunctional: number }[] =
    [];
  let consolidatedNetBalance = 0;

  for (const acct of foreignAccounts) {
    const balanceFx = await getAccountBalance(acct.code, orgId);
    if (Math.abs(balanceFx) < 0.01) continue;
    const balanceFunctional = ROUND(balanceFx * params.fxRate);
    consolidatedNetBalance = ROUND(consolidatedNetBalance + balanceFunctional);
    foreignBalances.push({
      accountCode: acct.code,
      currency: acct.currency,
      balanceFx,
      balanceFunctional,
    });
  }

  const consolidation = await runConsolidation(
    {
      periodYear: params.periodYear,
      periodMonth: params.periodMonth,
      parentEntityCode: params.parentEntityCode,
      functionalCurrency,
    },
    orgId,
  );

  const consolidatedNetBalanceFormatted = `${functionalCurrency} ${consolidatedNetBalance.toFixed(2)}`;

  return {
    ...consolidation,
    fxRateApplied: params.fxRate,
    fromCurrency,
    functionalCurrency,
    foreignBalances,
    consolidatedNetBalance,
    consolidatedNetBalanceFormatted,
  };
}

export async function recordIntercompanyEntry(
  input: {
    fromEntityCode: string;
    toEntityCode: string;
    amount: number;
    currency?: string;
    description?: string;
    periodYear: number;
    periodMonth: number;
  },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const entry = await postJournalEntry(
    {
      entryDate: new Date(input.periodYear, input.periodMonth - 1, 15),
      reference: `IC-${input.fromEntityCode}-${input.toEntityCode}`,
      memo: input.description ?? "Intercompany transfer",
      source: "CONSOLIDATION",
      lines: [
        {
          accountCode: "6200",
          debit: input.amount,
          description: `Due from ${input.toEntityCode}`,
        },
        {
          accountCode: "2000",
          credit: input.amount,
          description: `Due to ${input.fromEntityCode}`,
        },
      ],
    },
    orgId,
  );

  return db.intercompanyJournalEntry.create({
    data: {
      orgId,
      fromEntityCode: input.fromEntityCode,
      toEntityCode: input.toEntityCode,
      amount: input.amount,
      currency: input.currency ?? "USD",
      description: input.description,
      fromJournalEntryId: entry.id,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
    },
  });
}
