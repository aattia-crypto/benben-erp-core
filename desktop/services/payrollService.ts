/**
 * HR & Payroll — rc3 isolated service.
 * Consumes rc2 GL posting APIs; does not modify finance core modules.
 */
import { getPrisma } from "./database";
import { logActivity } from "./audit.service";
import { logger } from "../utils/logger";
import { postJournalWithIntegrity } from "./finance/journal-post.service";
import { ORG_DEFAULT } from "./finance/types";

const ROUND = (n: number) => Math.round(n * 100) / 100;

/** GL codes provisioned locally for payroll (not added to rc2 DEFAULT_CHART). */
export const PAYROLL_GL = {
  wagesExpense: "6300",
  payrollLiability: "2050",
} as const;

const PAYROLL_GL_ACCOUNTS = [
  { code: PAYROLL_GL.wagesExpense, name: "Wages Expense", type: "EXPENSE" },
  { code: PAYROLL_GL.payrollLiability, name: "Payroll Liability", type: "LIABILITY" },
] as const;

/** Simplified combined withholding for W-2 employees (federal + FICA placeholder). */
const W2_WITHHOLDING_RATE = 0.22;

/** 1099 contractors — no employer withholding in this rc3 baseline. */
const CONTRACTOR_1099_WITHHOLDING_RATE = 0;

export type PayrollLineBreakdown = {
  employeeId: string;
  employeeName: string;
  taxClassification: string;
  hours: number;
  hourlyRate: number;
  gross: number;
  deductions: number;
  net: number;
};

export type CalculatePayrollRunResult = {
  payrollRunId: string;
  periodStart: Date;
  periodEnd: Date;
  grossPay: number;
  deductions: number;
  netPay: number;
  lines: PayrollLineBreakdown[];
  timecardCount: number;
};

export type PostPayrollLedgerResult = {
  journalEntryId: string;
  duplicate: boolean;
};

/** Ensures payroll GL accounts exist without altering rc2 chart seed definitions. */
export async function ensurePayrollGlAccounts(orgId = ORG_DEFAULT): Promise<void> {
  const db = getPrisma();
  for (const acct of PAYROLL_GL_ACCOUNTS) {
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

function resolveTimecardHours(
  totalHours: number,
  clockIn: Date,
  clockOut: Date | null,
  periodEnd: Date,
): number {
  if (totalHours > 0) return ROUND(totalHours);
  if (!clockOut) {
    const cappedEnd = periodEnd.getTime() < Date.now() ? periodEnd : new Date();
    const ms = Math.max(0, cappedEnd.getTime() - clockIn.getTime());
    return ROUND(ms / 3_600_000);
  }
  const ms = Math.max(0, clockOut.getTime() - clockIn.getTime());
  return ROUND(ms / 3_600_000);
}

function withholdingRate(taxClassification: string): number {
  const normalized = taxClassification.trim().toUpperCase();
  if (normalized === "1099" || normalized === "1099-NEC" || normalized === "1099-MISC") {
    return CONTRACTOR_1099_WITHHOLDING_RATE;
  }
  return W2_WITHHOLDING_RATE;
}

function isSalariedPayType(payType: string | null | undefined): boolean {
  return (payType ?? "HOURLY").trim().toUpperCase() === "SALARIED";
}

type EmployeePayProfile = {
  id: string;
  name: string;
  taxClassification: string;
  baseWage: number;
  payType: string;
};

function periodGrossForEmployee(emp: EmployeePayProfile, hours: number): number {
  if (isSalariedPayType(emp.payType)) {
    return ROUND(emp.baseWage);
  }
  return ROUND(Math.max(0, hours) * emp.baseWage);
}

function buildPayrollLine(
  emp: EmployeePayProfile,
  hours: number,
): PayrollLineBreakdown {
  const gross = periodGrossForEmployee(emp, hours);
  const rate = withholdingRate(emp.taxClassification);
  const deductions = ROUND(gross * rate);
  const net = ROUND(gross - deductions);
  const hourlyRate = isSalariedPayType(emp.payType) ? 0 : ROUND(emp.baseWage);

  return {
    employeeId: emp.id,
    employeeName: emp.name,
    taxClassification: emp.taxClassification,
    hours: isSalariedPayType(emp.payType) ? 0 : ROUND(hours),
    hourlyRate,
    gross,
    deductions,
    net,
  };
}

/**
 * Aggregates approved timecards for the payroll run period, applies base wage rates,
 * and persists grossPay, deductions, and netPay on the PayrollRun record.
 */
export async function calculatePayrollRun(
  payrollRunId: string,
  orgId = ORG_DEFAULT,
): Promise<CalculatePayrollRunResult> {
  const db = getPrisma();
  const run = await db.payrollRun.findFirst({ where: { id: payrollRunId } });
  if (!run) throw new Error(`Payroll run not found: ${payrollRunId}`);
  if (run.processed) {
    throw new Error(`Payroll run ${payrollRunId} is already processed and cannot be recalculated.`);
  }

  const timecards = await db.timecard.findMany({
    where: {
      approved: true,
      clockIn: { gte: run.periodStart, lte: run.periodEnd },
    },
    include: { employee: true },
    orderBy: { clockIn: "asc" },
  });

  const byEmployee = new Map<string, PayrollLineBreakdown>();

  for (const card of timecards) {
    const emp = card.employee as EmployeePayProfile;

    if (isSalariedPayType(emp.payType)) {
      if (byEmployee.has(emp.id)) continue;
      byEmployee.set(emp.id, buildPayrollLine(emp, 0));
      continue;
    }

    const hours = resolveTimecardHours(
      card.totalHours,
      card.clockIn,
      card.clockOut,
      run.periodEnd,
    );
    if (hours <= 0) continue;

    const lineGross = periodGrossForEmployee(emp, hours);
    const rate = withholdingRate(emp.taxClassification);
    const lineDeductions = ROUND(lineGross * rate);
    const lineNet = ROUND(lineGross - lineDeductions);

    const existing = byEmployee.get(emp.id);
    if (existing) {
      existing.hours = ROUND(existing.hours + hours);
      existing.gross = ROUND(existing.gross + lineGross);
      existing.deductions = ROUND(existing.deductions + lineDeductions);
      existing.net = ROUND(existing.net + lineNet);
    } else {
      byEmployee.set(emp.id, {
        employeeId: emp.id,
        employeeName: emp.name,
        taxClassification: emp.taxClassification,
        hours,
        hourlyRate: ROUND(emp.baseWage),
        gross: lineGross,
        deductions: lineDeductions,
        net: lineNet,
      });
    }
  }

  const activeSalaried = await db.employee.findMany({
    where: { status: "ACTIVE", payType: "SALARIED" },
  });
  for (const emp of activeSalaried) {
    if (byEmployee.has(emp.id)) continue;
    byEmployee.set(emp.id, buildPayrollLine(emp, 0));
  }

  const lines = [...byEmployee.values()];
  const grossPay = ROUND(lines.reduce((s, l) => s + l.gross, 0));
  const deductions = ROUND(lines.reduce((s, l) => s + l.deductions, 0));
  const netPay = ROUND(lines.reduce((s, l) => s + l.net, 0));

  await db.payrollRun.update({
    where: { id: payrollRunId },
    data: { grossPay, deductions, netPay },
  });

  await logActivity({
    orgId,
    module: "HR",
    action: "PAYROLL_CALCULATED",
    entityType: "PayrollRun",
    entityId: payrollRunId,
    summary: `Gross ${grossPay} · Net ${netPay} · ${timecards.length} timecard(s)`,
    afterJson: JSON.stringify({ grossPay, deductions, netPay, employeeCount: lines.length }),
  });

  logger.info("Payroll run calculated", {
    payrollRunId,
    grossPay,
    deductions,
    netPay,
    timecardCount: timecards.length,
  });

  return {
    payrollRunId,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    grossPay,
    deductions,
    netPay,
    lines,
    timecardCount: timecards.length,
  };
}

/**
 * Ledger integration bridge — posts a balanced journal via rc2 {@link postJournalWithIntegrity}.
 * Call when PayrollRun.processed is true. Does not modify gl.service or journal-post internals.
 */
export async function postPayrollRunToLedger(
  payrollRunId: string,
  orgId = ORG_DEFAULT,
): Promise<PostPayrollLedgerResult> {
  const db = getPrisma();
  const run = await db.payrollRun.findFirst({ where: { id: payrollRunId } });
  if (!run) throw new Error(`Payroll run not found: ${payrollRunId}`);
  if (!run.processed) {
    throw new Error(
      `Payroll run ${payrollRunId} must be marked processed before posting to the ledger.`,
    );
  }

  const grossPay = ROUND(run.grossPay);
  if (grossPay <= 0) {
    throw new Error(`Payroll run ${payrollRunId} has no gross pay to post.`);
  }

  await ensurePayrollGlAccounts(orgId);

  const periodLabel = `${run.periodStart.toISOString().slice(0, 10)}–${run.periodEnd.toISOString().slice(0, 10)}`;
  const reference = `PAYROLL-${payrollRunId.slice(0, 8).toUpperCase()}`;

  const posted = await postJournalWithIntegrity(
    {
      memo: `Payroll run ${periodLabel} · gross ${grossPay}`,
      lines: [
        {
          accountCode: PAYROLL_GL.wagesExpense,
          debit: grossPay,
          credit: 0,
          description: "Wages expense",
        },
        {
          accountCode: PAYROLL_GL.payrollLiability,
          debit: 0,
          credit: grossPay,
          description: "Payroll liability (net + withholdings)",
        },
      ],
      source: "PAYROLL",
      module: "HR",
      reference,
      entryDate: run.periodEnd,
      idempotencyKey: `payroll-run-${payrollRunId}`,
    },
    orgId,
  );

  await logActivity({
    orgId,
    module: "HR",
    action: "PAYROLL_GL_POSTED",
    entityType: "PayrollRun",
    entityId: payrollRunId,
    summary: `${reference} → journal ${posted.id}`,
    afterJson: JSON.stringify({
      journalEntryId: posted.id,
      duplicate: posted.duplicate,
      grossPay,
    }),
  });

  logger.info("Payroll posted to ledger", {
    payrollRunId,
    journalEntryId: posted.id,
    duplicate: posted.duplicate,
  });

  return { journalEntryId: posted.id, duplicate: posted.duplicate };
}

/**
 * Calculates totals, marks the run processed, and invokes the ledger bridge.
 */
export async function finalizePayrollRun(
  payrollRunId: string,
  orgId = ORG_DEFAULT,
): Promise<{
  calculation: CalculatePayrollRunResult;
  ledger: PostPayrollLedgerResult;
}> {
  const calculation = await calculatePayrollRun(payrollRunId, orgId);

  const db = getPrisma();
  await db.payrollRun.update({
    where: { id: payrollRunId },
    data: { processed: true },
  });

  const ledger = await postPayrollRunToLedger(payrollRunId, orgId);
  return { calculation, ledger };
}
