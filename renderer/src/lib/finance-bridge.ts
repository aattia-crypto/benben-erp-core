/**
 * Desktop IPC bridge for finance module actions (consolidation, tax, budgets).
 */
import { isDesktopShell } from "./desktop-api";
import { financeApiFetch } from "./finance-api-client";

type IpcOk<T> = { ok: true; data: T };
type IpcErr = { ok: false; error: string };

function financeApi() {
  const api = window.benben?.finance;
  if (!api) throw new Error("Finance module requires the Benben desktop app.");
  return api;
}

function unwrap<T>(res: IpcOk<T> | IpcErr): T {
  if (!res.ok) throw new Error(res.error || "Request failed.");
  return res.data;
}

export function isFinanceDesktopAvailable(): boolean {
  return isDesktopShell() && !!window.benben?.finance;
}

export async function runConsolidation(input: {
  fxRate: number;
  periodYear?: number;
  periodMonth?: number;
  fromCurrency?: string;
  functionalCurrency?: string;
}) {
  if (isFinanceDesktopAvailable()) {
    const res = await financeApi().runConsolidation(input);
    return unwrap(res as IpcOk<Record<string, unknown>>);
  }
  const now = new Date();
  return financeApiFetch<Record<string, unknown>>("/api/finance/consolidation/run", {
    method: "POST",
    body: JSON.stringify({
      periodYear: input.periodYear ?? now.getFullYear(),
      periodMonth: input.periodMonth ?? now.getMonth() + 1,
      fxRate: input.fxRate,
      fromCurrency: input.fromCurrency,
      functionalCurrency: input.functionalCurrency,
    }),
  });
}

export async function calculateSampleTax(input?: {
  taxZoneCode?: string;
  invoiceRef?: string;
  amount?: number;
}) {
  if (isFinanceDesktopAvailable()) {
    const res = await financeApi().calculateTax(input);
    return unwrap(res as IpcOk<{ taxTotal: number; grandTotal: number; snapshotId?: string }>);
  }
  return financeApiFetch<{ taxTotal: number; grandTotal: number; snapshotId?: string }>(
    "/api/finance/tax/calculate",
    {
      method: "POST",
      body: JSON.stringify({
        taxZoneCode: input?.taxZoneCode ?? "US-DEFAULT",
        persistSnapshot: true,
        invoiceRef: input?.invoiceRef ?? `INV-${Date.now()}`,
        lines: [{ lineId: "1", amount: input?.amount ?? 100, taxCategory: "STANDARD" }],
      }),
    },
  );
}

export async function createSampleBudget(fiscalYear?: number) {
  if (isFinanceDesktopAvailable()) {
    const res = await financeApi().createSampleBudget(fiscalYear);
    return unwrap(res as IpcOk<Record<string, unknown>>);
  }
  const year = fiscalYear ?? new Date().getFullYear();
  return financeApiFetch<Record<string, unknown>>("/api/finance/budgets", {
    method: "POST",
    body: JSON.stringify({
      name: `FY${year} Operations (Sample)`,
      fiscalYear: year,
      status: "ACTIVE",
      lineItems: [
        {
          costCenterCode: "COST_CENTER_OPS",
          accountCode: "5000",
          periodYear: year,
          periodMonth: new Date().getMonth() + 1,
          budgetAmount: 50000,
        },
      ],
    }),
  });
}

export async function updateFxRate(fromCurrency: string, toCurrency: string, rate: number) {
  const now = new Date();
  return financeApiFetch("/api/finance/currency/rates-update", {
    method: "POST",
    body: JSON.stringify({
      rates: [
        {
          fromCurrency,
          toCurrency,
          rate,
          rateDate: now.toISOString().slice(0, 10),
        },
      ],
    }),
  });
}

export async function loadBudgetVariance(fiscalYear: number) {
  return financeApiFetch<{ rows: unknown[] }>(
    `/api/finance/budgets/variance-report?fiscalYear=${fiscalYear}`,
  );
}
