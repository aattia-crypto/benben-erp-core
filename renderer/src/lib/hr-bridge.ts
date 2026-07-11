/**
 * Desktop IPC bridge for HR & Payroll (window.benben.hr / .payroll).
 */
import { DEMO_EMPLOYEES } from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import { isLanMode } from "./lan-mode";
import { lanApiFetch } from "./lan-api-client";

export type EmployeeDto = {
  id: string;
  name: string;
  jobTitle: string;
  payType: PayType;
  taxClassification: string;
  baseWage: number;
  status: string;
};

export type PayType = "HOURLY" | "SALARIED";

export type TimecardDto = {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number;
  approved: boolean;
  employee?: { id: string; name: string; taxClassification?: string };
};

export type PayrollRunDto = {
  id: string;
  periodStart: string;
  periodEnd: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  processed: boolean;
};

type IpcOk<T> = { ok: true; data: T };
type IpcErr = { ok: false; error: string };

function hrApi() {
  const api = window.benben?.hr;
  if (!api) throw new Error("HR module requires the Benben desktop app.");
  return api;
}

function payrollApi() {
  const api = window.benben?.payroll;
  if (!api) throw new Error("Payroll module requires the Benben desktop app.");
  return api;
}

function unwrap<T>(res: IpcOk<T> | IpcErr): T {
  if (!res.ok) throw new Error(res.error || "Request failed.");
  return res.data;
}

function serializeEmployee(row: Record<string, unknown>): EmployeeDto {
  const payTypeRaw = String(row.payType ?? "HOURLY").toUpperCase();
  return {
    id: String(row.id),
    name: String(row.name),
    jobTitle: String(row.jobTitle ?? ""),
    payType: payTypeRaw === "SALARIED" ? "SALARIED" : "HOURLY",
    taxClassification: String(row.taxClassification),
    baseWage: Number(row.baseWage),
    status: String(row.status),
  };
}

function serializeTimecard(row: Record<string, unknown>): TimecardDto {
  const emp = row.employee as Record<string, unknown> | undefined;
  return {
    id: String(row.id),
    employeeId: String(row.employeeId),
    clockIn: new Date(row.clockIn as string | Date).toISOString(),
    clockOut: row.clockOut ? new Date(row.clockOut as string | Date).toISOString() : null,
    totalHours: Number(row.totalHours),
    approved: Boolean(row.approved),
    employee: emp
      ? { id: String(emp.id), name: String(emp.name), taxClassification: String(emp.taxClassification ?? "") }
      : undefined,
  };
}

function serializePayrollRun(row: Record<string, unknown>): PayrollRunDto {
  return {
    id: String(row.id),
    periodStart: new Date(row.periodStart as string | Date).toISOString(),
    periodEnd: new Date(row.periodEnd as string | Date).toISOString(),
    grossPay: Number(row.grossPay),
    deductions: Number(row.deductions),
    netPay: Number(row.netPay),
    processed: Boolean(row.processed),
  };
}

export async function fetchEmployees(): Promise<EmployeeDto[]> {
  if (isDemoBuild()) {
    try {
      let rows: EmployeeDto[] = [];
      if (isLanMode()) {
        const res = await lanApiFetch<{ data: Record<string, unknown>[] }>("/api/hr/employees");
        rows = (res.data ?? []).map(serializeEmployee);
      } else if (window.benben?.hr) {
        const res = await hrApi().getEmployees();
        rows = (unwrap(res as IpcOk<Record<string, unknown>[]>) ?? []).map(serializeEmployee);
      }
      if (rows.length > 0) return rows;
    } catch {
      /* Presenter Mode: fall through to fixtures */
    }
    return DEMO_EMPLOYEES.map((e) => ({ ...e }));
  }

  try {
    let rows: EmployeeDto[];
    if (isLanMode()) {
      const res = await lanApiFetch<{ data: Record<string, unknown>[] }>("/api/hr/employees");
      rows = (res.data ?? []).map(serializeEmployee);
    } else {
      const res = await hrApi().getEmployees();
      rows = (unwrap(res as IpcOk<Record<string, unknown>[]>) ?? []).map(serializeEmployee);
    }
    return rows;
  } catch (err) {
    throw err;
  }
}

export async function fetchActiveEmployees(): Promise<EmployeeDto[]> {
  if (isLanMode()) {
    const res = await lanApiFetch<{ data: Record<string, unknown>[] }>("/api/hr/employees/active");
    return (res.data ?? []).map(serializeEmployee);
  }
  const api = hrApi() as { listActiveEmployees?: () => Promise<IpcOk<Record<string, unknown>[]> | IpcErr> };
  if (!api.listActiveEmployees) {
    const all = await fetchEmployees();
    return all.filter((e) => e.status.toUpperCase() === "ACTIVE");
  }
  const res = await api.listActiveEmployees();
  const rows = unwrap(res) ?? [];
  return rows.map(serializeEmployee);
}

export async function createEmployee(input: {
  name: string;
  jobTitle?: string;
  payType?: PayType;
  taxClassification: string;
  baseWage: number;
  status?: string;
}): Promise<EmployeeDto> {
  const res = await hrApi().createEmployee(input);
  return serializeEmployee(unwrap(res as IpcOk<Record<string, unknown>>));
}

export async function fetchTimecards(): Promise<TimecardDto[]> {
  if (isLanMode()) {
    const res = await lanApiFetch<{ data: Record<string, unknown>[] }>("/api/hr/timecards");
    return (res.data ?? []).map(serializeTimecard);
  }
  const res = await hrApi().getTimecards();
  const rows = unwrap(res as IpcOk<Record<string, unknown>[]>) ?? [];
  return rows.map(serializeTimecard);
}

export async function createTimecard(input: {
  employeeId: string;
  clockIn: string;
  clockOut?: string | null;
  totalHours?: number;
}): Promise<TimecardDto> {
  const res = await hrApi().createTimecard(input);
  return serializeTimecard(unwrap(res as IpcOk<Record<string, unknown>>));
}

export async function approveTimecard(timecardId: string): Promise<TimecardDto> {
  const res = await hrApi().approveTimecard(timecardId);
  return serializeTimecard(unwrap(res as IpcOk<Record<string, unknown>>));
}

export async function fetchPayrollRuns(): Promise<PayrollRunDto[]> {
  if (isLanMode()) {
    const res = await lanApiFetch<{ data: Record<string, unknown>[] }>("/api/hr/payroll-runs");
    return (res.data ?? []).map(serializePayrollRun);
  }
  const res = await hrApi().getPayrollRuns();
  const rows = unwrap(res as IpcOk<Record<string, unknown>[]>) ?? [];
  return rows.map(serializePayrollRun);
}

export async function createPayrollRun(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<PayrollRunDto> {
  const res = await hrApi().createPayrollRun(input);
  return serializePayrollRun(unwrap(res as IpcOk<Record<string, unknown>>));
}

export async function calculatePayrollRun(payrollRunId: string) {
  const res = await payrollApi().calculate(payrollRunId);
  return unwrap(res as IpcOk<unknown>);
}

export async function finalizePayrollRun(payrollRunId: string) {
  const res = await payrollApi().finalize(payrollRunId);
  return unwrap(res as IpcOk<unknown>);
}

export function isHrDesktopAvailable(): boolean {
  if (isLanMode()) return true;
  return typeof window !== "undefined" && !!window.benben?.hr && !!window.benben?.payroll;
}

export async function importExternalPayroll(filePath: string, entryDate?: string) {
  const res = await payrollApi().importExternal({ filePath, entryDate });
  return unwrap(res as IpcOk<{
    summary: ExternalPayrollSummary;
    journalEntryId: string;
    duplicate: boolean;
    rowsParsed: number;
  }>);
}

export type ExternalPayrollSummary = {
  grossWages: number;
  employeeTaxes: number;
  employerTaxes: number;
  benefits: number;
  netPay: number;
  provider?: string;
  payDate?: string;
};
