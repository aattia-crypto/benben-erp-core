import { getPrisma } from "../database";
import { findBankMatchCandidates } from "./gl.service";
import {
  ORG_DEFAULT,
  type AutoMatchInput,
  type BankStatementUploadInput,
  type ManualMatchInput,
  type MatchStatus,
} from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export async function uploadBankStatement(
  input: BankStatementUploadInput,
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const statement = await db.bankStatement.create({
    data: {
      orgId,
      bankAccountCode: input.bankAccountCode,
      statementDate: new Date(input.statementDate),
      periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
      currency: input.currency ?? "USD",
      fileName: input.fileName,
      status: "OPEN",
      transactions: {
        create: input.transactions.map((t) => ({
          orgId,
          txnDate: new Date(t.txnDate),
          amount: t.amount,
          reference: t.reference,
          checkNumber: t.checkNumber,
          description: t.description,
          matchStatus: "UNMATCHED",
          matchedAmount: 0,
        })),
      },
    },
    include: { transactions: true },
  });
  return statement;
}

export async function autoMatchBankTransactions(
  input: AutoMatchInput,
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const statement = await db.bankStatement.findFirst({
    where: { id: input.bankStatementId, orgId },
    include: { transactions: true },
  });
  if (!statement) {
    throw new Error(`Bank statement not found: ${input.bankStatementId}`);
  }

  const dateTolerance = input.dateToleranceDays ?? 3;
  const amountTolerance = input.amountTolerance ?? 0.01;
  const results: {
    bankTransactionId: string;
    matched: boolean;
    journalLineIds: string[];
  }[] = [];

  for (const txn of statement.transactions) {
    if (txn.matchStatus === "RECONCILED" || txn.matchStatus === "MATCHED") {
      continue;
    }

    const existingLogIds = (
      await db.reconciliationLog.findMany({
        where: { bankTransactionId: txn.id },
        select: { journalLineId: true },
      })
    )
      .map((l) => l.journalLineId)
      .filter((id): id is string => Boolean(id));

    const candidates = await findBankMatchCandidates(
      {
        bankAccountCode: statement.bankAccountCode,
        amount: txn.amount,
        txnDate: txn.txnDate,
        reference: txn.reference,
        checkNumber: txn.checkNumber,
        dateToleranceDays: dateTolerance,
        amountTolerance,
        excludeLineIds: existingLogIds,
      },
      orgId,
    );

    if (!candidates.length) {
      results.push({ bankTransactionId: txn.id, matched: false, journalLineIds: [] });
      continue;
    }

    const best = candidates[0];
    const matchAmount = ROUND(Math.abs(txn.amount));

    await db.reconciliationLog.create({
      data: {
        orgId,
        bankTransactionId: txn.id,
        journalLineId: best.journalLineId,
        journalEntryId: best.journalEntryId,
        matchedAmount: matchAmount,
        matchType: "AUTO",
        matchedBy: "system",
      },
    });

    await updateTransactionMatchStatus(txn.id, orgId);
    results.push({
      bankTransactionId: txn.id,
      matched: true,
      journalLineIds: [best.journalLineId],
    });
  }

  await db.bankStatement.update({
    where: { id: statement.id },
    data: { status: "IN_PROGRESS" },
  });

  return { statementId: statement.id, results };
}

export async function manualMatchBankTransaction(
  input: ManualMatchInput,
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const txn = await db.bankTransaction.findFirst({
    where: { id: input.bankTransactionId, orgId },
    include: { bankStatement: true },
  });
  if (!txn) {
    throw new Error(`Bank transaction not found: ${input.bankTransactionId}`);
  }

  const lines = await db.glJournalLine.findMany({
    where: { id: { in: input.journalLineIds }, orgId },
    include: { journalEntry: true },
  });
  if (lines.length !== input.journalLineIds.length) {
    throw new Error("One or more journal lines not found.");
  }

  const txnAbs = ROUND(Math.abs(txn.amount));
  let allocated = 0;

  for (const line of lines) {
    const lineAmount = ROUND(Math.abs(line.debit - line.credit));
    await db.reconciliationLog.create({
      data: {
        orgId,
        bankTransactionId: txn.id,
        journalLineId: line.id,
        journalEntryId: line.journalEntryId,
        matchedAmount: lineAmount,
        matchType: "MANUAL",
        matchedBy: input.matchedBy ?? "user",
        notes: input.notes,
      },
    });
    allocated += lineAmount;
  }

  await updateTransactionMatchStatus(txn.id, orgId);

  const status = await db.bankTransaction.findUnique({
    where: { id: txn.id },
    select: { matchStatus: true, matchedAmount: true },
  });

  return {
    bankTransactionId: txn.id,
    matchStatus: status?.matchStatus,
    matchedAmount: status?.matchedAmount,
    allocated,
    targetAmount: txnAbs,
  };
}

async function updateTransactionMatchStatus(
  bankTransactionId: string,
  orgId: string,
): Promise<MatchStatus> {
  const db = getPrisma();
  const txn = await db.bankTransaction.findFirst({
    where: { id: bankTransactionId, orgId },
    include: { reconciliationLogs: true },
  });
  if (!txn) throw new Error("Transaction missing");

  const matchedAmount = ROUND(
    txn.reconciliationLogs.reduce((s, l) => s + l.matchedAmount, 0),
  );
  const target = ROUND(Math.abs(txn.amount));

  let matchStatus: MatchStatus = "UNMATCHED";
  if (matchedAmount <= 0) {
    matchStatus = "UNMATCHED";
  } else if (matchedAmount < target - 0.01) {
    matchStatus = "PARTIALLY_MATCHED";
  } else if (matchedAmount >= target - 0.01) {
    matchStatus = "MATCHED";
  }

  await db.bankTransaction.update({
    where: { id: txn.id },
    data: { matchedAmount, matchStatus },
  });

  return matchStatus;
}

export async function markStatementReconciled(
  bankStatementId: string,
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const pending = await db.bankTransaction.count({
    where: {
      bankStatementId,
      orgId,
      matchStatus: { in: ["UNMATCHED", "PARTIALLY_MATCHED"] },
    },
  });
  if (pending > 0) {
    throw new Error(`${pending} transactions still unmatched or partial.`);
  }

  await db.bankTransaction.updateMany({
    where: { bankStatementId, orgId, matchStatus: "MATCHED" },
    data: { matchStatus: "RECONCILED" },
  });

  return db.bankStatement.update({
    where: { id: bankStatementId },
    data: { status: "RECONCILED" },
  });
}
