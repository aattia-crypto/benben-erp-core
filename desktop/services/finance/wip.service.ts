import { getPrisma } from "../database";
import { logActivity } from "../audit.service";
import { logger } from "../../utils/logger";
import { getAccountBalance } from "./gl.service";
import { postJournalWithIntegrity } from "./journal-post.service";
import { listJournalEntries } from "./gl-read.service";
import { ORG_DEFAULT } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export type CapitalizeWipInput = {
  amount: number;
  creditAccountCode?: string;
  batchId?: string;
  batchCode?: string;
  memo?: string;
  sourceRef?: string;
  idempotencyKey?: string;
};

export async function capitalizeWip(input: CapitalizeWipInput, orgId = ORG_DEFAULT) {
  const amount = ROUND(input.amount);
  if (amount <= 0) return { journalEntryId: null, duplicate: false, skipped: true };

  const creditAccount = input.creditAccountCode?.trim() || "5000";
  const reference = input.sourceRef ?? input.batchId ?? input.batchCode;
  const memo =
    input.memo ??
    `WIP capitalization${input.batchCode ? ` · ${input.batchCode}` : input.batchId ? ` · ${input.batchId}` : ""}`;

  const posted = await postJournalWithIntegrity(
    {
      memo,
      lines: [
        { accountCode: "1210", debit: amount, credit: 0, description: "WIP asset capitalization" },
        { accountCode: creditAccount, debit: 0, credit: amount, description: "Expense relief to WIP" },
      ],
      source: "WIP",
      module: "wip",
      reference,
      idempotencyKey: input.idempotencyKey ?? `wip-cap-${reference ?? "manual"}-${amount}`,
    },
    orgId,
  );

  await logActivity({
    module: "wip",
    action: "WIP_CAPITALIZED",
    entityType: "GlJournalEntry",
    entityId: posted.id,
    summary: `${memo} · $${amount.toFixed(2)}`,
    afterJson: JSON.stringify({ batchId: input.batchId, creditAccount, duplicate: posted.duplicate }),
  });

  logger.info("WIP capitalized", {
    amount,
    batchId: input.batchId,
    journalEntryId: posted.id,
    duplicate: posted.duplicate,
  });

  return { journalEntryId: posted.id, duplicate: posted.duplicate, skipped: false };
}

export async function getWipLedgerDashboard(orgId = ORG_DEFAULT) {
  const db = getPrisma();
  const wipLedgerBalance = await getAccountBalance("1210", orgId);
  const batchAgg = await db.productionBatch.aggregate({
    where: { orgId, status: { in: ["active", "planning"] } },
    _sum: { wipValue: true },
    _count: true,
  });

  const recentEntries = await listJournalEntries(
    { accountCode: "1210", limit: 15 },
    orgId,
  );

  return {
    wipLedgerBalance: ROUND(wipLedgerBalance),
    operationalWipValue: ROUND(batchAgg._sum.wipValue ?? 0),
    activeBatchCount: batchAgg._count,
    recentCapitalizations: recentEntries,
  };
}
