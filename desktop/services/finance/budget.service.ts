import { getPrisma } from "../database";
import { sumExpensesByCostCenter } from "./gl.service";
import { ORG_DEFAULT, type BudgetCheckMode, type BudgetValidateInput } from "./types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export interface CreateBudgetInput {
  name: string;
  fiscalYear: number;
  currency?: string;
  status?: string;
  lineItems: {
    costCenterCode: string;
    accountCode: string;
    periodYear: number;
    periodMonth: number;
    budgetAmount: number;
    alertThreshold?: number;
  }[];
}

export async function createBudgetPlan(input: CreateBudgetInput, orgId = ORG_DEFAULT) {
  const db = getPrisma();

  const plan = await db.budgetPlan.create({
    data: {
      orgId,
      name: input.name,
      fiscalYear: input.fiscalYear,
      currency: input.currency ?? "USD",
      status: input.status ?? "ACTIVE",
    },
  });

  for (const line of input.lineItems) {
    const cc = await db.costCenter.upsert({
      where: { orgId_code: { orgId, code: line.costCenterCode } },
      create: { orgId, code: line.costCenterCode, name: line.costCenterCode },
      update: {},
    });

    await db.budgetLineItem.create({
      data: {
        orgId,
        budgetPlanId: plan.id,
        costCenterId: cc.id,
        accountCode: line.accountCode,
        periodYear: line.periodYear,
        periodMonth: line.periodMonth,
        budgetAmount: line.budgetAmount,
        alertThreshold: line.alertThreshold ?? 0.9,
      },
    });
  }

  return db.budgetPlan.findUnique({
    where: { id: plan.id },
    include: { lineItems: { include: { costCenter: true } } },
  });
}

export async function validateBudgetAvailability(
  input: BudgetValidateInput,
  orgId = ORG_DEFAULT,
): Promise<{
  allowed: boolean;
  mode: BudgetCheckMode;
  budgetAmount: number;
  actualAmount: number;
  requestedAmount: number;
  remaining: number;
  message: string;
}> {
  const db = getPrisma();
  const mode = input.mode ?? "HARD_BLOCK";

  const costCenter = await db.costCenter.findFirst({
    where: { orgId, code: input.costCenterCode },
  });
  if (!costCenter) {
    return {
      allowed: true,
      mode,
      budgetAmount: 0,
      actualAmount: 0,
      requestedAmount: input.amount,
      remaining: Infinity,
      message: "No cost center defined — budget check skipped.",
    };
  }

  const activePlan = await db.budgetPlan.findFirst({
    where: { orgId, status: "ACTIVE", fiscalYear: input.periodYear },
    orderBy: { createdAt: "desc" },
  });
  if (!activePlan) {
    return {
      allowed: true,
      mode,
      budgetAmount: 0,
      actualAmount: 0,
      requestedAmount: input.amount,
      remaining: Infinity,
      message: "No active budget plan — check skipped.",
    };
  }

  const line = await db.budgetLineItem.findFirst({
    where: {
      budgetPlanId: activePlan.id,
      costCenterId: costCenter.id,
      accountCode: input.accountCode,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
    },
  });

  if (!line) {
    return {
      allowed: true,
      mode,
      budgetAmount: 0,
      actualAmount: 0,
      requestedAmount: input.amount,
      remaining: Infinity,
      message: "No budget line for this dimension — check skipped.",
    };
  }

  const actual = await sumExpensesByCostCenter(
    costCenter.id,
    input.accountCode,
    input.periodYear,
    input.periodMonth,
    orgId,
  );

  const projected = ROUND(actual + input.amount);
  const remaining = ROUND(line.budgetAmount - actual);
  const threshold = line.alertThreshold ?? 0.9;
  const warnLevel = line.budgetAmount * threshold;

  if (projected <= line.budgetAmount) {
    const warn = projected >= warnLevel;
    return {
      allowed: true,
      mode,
      budgetAmount: line.budgetAmount,
      actualAmount: actual,
      requestedAmount: input.amount,
      remaining,
      message: warn
        ? `Approaching budget (${ROUND((projected / line.budgetAmount) * 100)}% utilized).`
        : "Within budget.",
    };
  }

  const overBy = ROUND(projected - line.budgetAmount);
  if (mode === "WARN_ONLY") {
    return {
      allowed: true,
      mode,
      budgetAmount: line.budgetAmount,
      actualAmount: actual,
      requestedAmount: input.amount,
      remaining,
      message: `Over budget by ${overBy} (warning only).`,
    };
  }

  return {
    allowed: false,
    mode,
    budgetAmount: line.budgetAmount,
    actualAmount: actual,
    requestedAmount: input.amount,
    remaining,
    message: `Budget exceeded by ${overBy}. Expense blocked.`,
  };
}

export async function getBudgetVarianceReport(
  params: { fiscalYear: number; budgetPlanId?: string },
  orgId = ORG_DEFAULT,
) {
  const db = getPrisma();
  const plan =
    params.budgetPlanId != null
      ? await db.budgetPlan.findFirst({ where: { id: params.budgetPlanId, orgId } })
      : await db.budgetPlan.findFirst({
          where: { orgId, fiscalYear: params.fiscalYear, status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
        });

  if (!plan) {
    throw new Error("No budget plan found for variance report.");
  }

  const lines = await db.budgetLineItem.findMany({
    where: { budgetPlanId: plan.id },
    include: { costCenter: true },
  });

  const rows = [];
  for (const line of lines) {
    const actual = await sumExpensesByCostCenter(
      line.costCenterId,
      line.accountCode,
      line.periodYear,
      line.periodMonth,
      orgId,
    );
    const variance = ROUND(line.budgetAmount - actual);
    const utilization =
      line.budgetAmount > 0 ? ROUND((actual / line.budgetAmount) * 100) : 0;

    rows.push({
      costCenterCode: line.costCenter.code,
      accountCode: line.accountCode,
      periodYear: line.periodYear,
      periodMonth: line.periodMonth,
      budgetAmount: line.budgetAmount,
      actualAmount: actual,
      variance,
      utilizationPercent: utilization,
      status: actual > line.budgetAmount ? "OVER" : utilization >= (line.alertThreshold ?? 0.9) * 100 ? "WARN" : "OK",
    });
  }

  return { plan, rows };
}

/** Seeds a sample fiscal budget cap for operations cost center (AP approval hook). */
export async function createSampleOperationsBudget(fiscalYear?: number, orgId = ORG_DEFAULT) {
  const year = fiscalYear ?? new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  return createBudgetPlan(
    {
      name: `FY${year} Operations (Sample)`,
      fiscalYear: year,
      status: "ACTIVE",
      lineItems: [
        {
          costCenterCode: "COST_CENTER_OPS",
          accountCode: "5000",
          periodYear: year,
          periodMonth: month,
          budgetAmount: 50000,
          alertThreshold: 0.9,
        },
      ],
    },
    orgId,
  );
}
