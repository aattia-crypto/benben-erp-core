/**
 * HR data access — rc3 isolated service (employees, timecards, payroll run records).
 */
import { getPrisma } from "./database";
import { logActivity } from "./audit.service";
import { logger } from "../utils/logger";

const ROUND = (n: number) => Math.round(n * 100) / 100;

export type CreateEmployeeInput = {
  name: string;
  jobTitle?: string;
  payType?: string;
  taxClassification: string;
  baseWage: number;
  status?: string;
};

export type CreateTimecardInput = {
  employeeId: string;
  clockIn: string;
  clockOut?: string | null;
  totalHours?: number;
};

export type CreatePayrollRunInput = {
  periodStart: string;
  periodEnd: string;
};

export async function listEmployees() {
  const db = getPrisma();
  return db.employee.findMany({ orderBy: { name: "asc" } });
}

export async function listActiveEmployees() {
  const db = getPrisma();
  return db.employee.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
}

export async function createEmployee(input: CreateEmployeeInput) {
  const db = getPrisma();
  const name = input.name.trim();
  if (!name) throw new Error("Employee name is required.");

  const taxClassification = input.taxClassification.trim();
  if (!taxClassification) throw new Error("Tax classification is required (W2 or 1099).");

  const baseWage = ROUND(Number(input.baseWage));
  if (baseWage <= 0) throw new Error("Base wage must be greater than zero.");

  const jobTitle = input.jobTitle?.trim() ?? "";
  if (!jobTitle) throw new Error("Job title is required.");

  const payTypeRaw = (input.payType?.trim() || "HOURLY").toUpperCase();
  if (payTypeRaw !== "HOURLY" && payTypeRaw !== "SALARIED") {
    throw new Error("Pay type must be HOURLY or SALARIED.");
  }

  const employee = await db.employee.create({
    data: {
      name,
      jobTitle: jobTitle.slice(0, 120),
      payType: payTypeRaw,
      taxClassification,
      baseWage,
      status: input.status?.trim() || "ACTIVE",
    },
  });

  await logActivity({
    module: "HR",
    action: "EMPLOYEE_CREATED",
    entityType: "Employee",
    entityId: employee.id,
    summary: name,
  });

  logger.info("Employee created", { id: employee.id, name });
  return employee;
}

export async function listTimecards() {
  const db = getPrisma();
  return db.timecard.findMany({
    include: { employee: { select: { id: true, name: true, taxClassification: true } } },
    orderBy: { clockIn: "desc" },
  });
}

export async function createTimecard(input: CreateTimecardInput) {
  const db = getPrisma();
  const employee = await db.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new Error("Employee not found.");

  const clockIn = new Date(input.clockIn);
  if (Number.isNaN(clockIn.getTime())) throw new Error("Invalid clock-in time.");

  const clockOut = input.clockOut ? new Date(input.clockOut) : null;
  if (clockOut && Number.isNaN(clockOut.getTime())) throw new Error("Invalid clock-out time.");

  let totalHours = ROUND(Number(input.totalHours ?? 0));
  if (totalHours <= 0 && clockOut) {
    totalHours = ROUND(Math.max(0, clockOut.getTime() - clockIn.getTime()) / 3_600_000);
  }

  const timecard = await db.timecard.create({
    data: {
      employeeId: input.employeeId,
      clockIn,
      clockOut,
      totalHours,
      approved: false,
    },
    include: { employee: { select: { id: true, name: true } } },
  });

  await logActivity({
    module: "HR",
    action: "TIMECARD_CREATED",
    entityType: "Timecard",
    entityId: timecard.id,
    summary: `${employee.name} · ${clockIn.toISOString()}`,
  });

  return timecard;
}

export async function approveTimecard(timecardId: string) {
  const db = getPrisma();
  const existing = await db.timecard.findUnique({ where: { id: timecardId } });
  if (!existing) throw new Error("Timecard not found.");

  const timecard = await db.timecard.update({
    where: { id: timecardId },
    data: { approved: true },
    include: { employee: { select: { id: true, name: true } } },
  });

  await logActivity({
    module: "HR",
    action: "TIMECARD_APPROVED",
    entityType: "Timecard",
    entityId: timecardId,
  });

  return timecard;
}

export async function listPayrollRuns() {
  const db = getPrisma();
  return db.payrollRun.findMany({ orderBy: { periodStart: "desc" } });
}

export async function createPayrollRun(input: CreatePayrollRunInput) {
  const db = getPrisma();
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    throw new Error("Invalid payroll period dates.");
  }
  if (periodEnd < periodStart) {
    throw new Error("Period end must be on or after period start.");
  }

  const run = await db.payrollRun.create({
    data: {
      periodStart,
      periodEnd,
      grossPay: 0,
      deductions: 0,
      netPay: 0,
      processed: false,
    },
  });

  await logActivity({
    module: "payroll",
    action: "PAYROLL_RUN_CREATED",
    entityType: "PayrollRun",
    entityId: run.id,
    summary: `${periodStart.toISOString().slice(0, 10)} – ${periodEnd.toISOString().slice(0, 10)}`,
  });

  return run;
}
