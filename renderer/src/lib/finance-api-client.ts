import { friendlyFinanceApiError } from "./finance-api-errors";
import { logClientError } from "./error-log";
import { getLanApiBase, isLanMode } from "./lan-mode";
import { getLanToken } from "./lan-api-client";

const DEFAULT_BASE = "http://127.0.0.1:3847";

/** Browser-only Vite dev (npm run dev:ui) — proxy /api to loopback finance server. */
function isViteDevBrowserShell(): boolean {
  if (typeof window === "undefined") return false;
  if (window.benben) return false;
  if (!import.meta.env.DEV) return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const w = window as unknown as { __BENBEN_FINANCE_API__?: string };
    if (w.__BENBEN_FINANCE_API__) return w.__BENBEN_FINANCE_API__;
    if (isLanMode()) return getLanApiBase();
    if (isViteDevBrowserShell()) return window.location.origin;
  }
  return DEFAULT_BASE;
}

function authHeaders(): Record<string, string> {
  const token = getLanToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function financeApiFetch<T>(
  path: string,
  init?: RequestInit,
  retries = 1,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${getBaseUrl()}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
          ...(init?.headers ?? {}),
        },
      });
      const json = (await res.json()) as T & { error?: string };
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? `Finance API ${res.status}`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
    }
  }
  const friendly = friendlyFinanceApiError(lastErr);
  logClientError("finance-api", friendly, { path });
  throw new Error(friendly);
}

export async function financeHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/finance/health`);
    if (!res.ok) return false;
    const json = (await res.json()) as { status?: string };
    return json.status === "ok";
  } catch {
    return false;
  }
}

/** Poll until loopback Finance API responds (Electron boot / demo presenter). */
export async function whenFinanceApiReady(timeoutMs = 10_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await financeHealthCheck()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return financeHealthCheck();
}

export const financeApi = {
  dashboard: () => financeApiFetch<import("./finance-api-types").FinanceDashboard>("/api/finance/dashboard"),
  glAccounts: () =>
    financeApiFetch<{ accounts: import("./finance-api-types").ApiGlAccount[] }>("/api/finance/gl/accounts"),
  glEntries: (q?: Record<string, string>) => {
    const params = new URLSearchParams(q);
    const qs = params.toString();
    return financeApiFetch<{ entries: import("./finance-api-types").ApiJournalEntry[] }>(
      `/api/finance/gl/entries${qs ? `?${qs}` : ""}`,
    );
  },
  glTrialBalance: () =>
    financeApiFetch<{ rows: { code: string; name: string; type: string; debit: number; credit: number; balance: number }[] }>(
      "/api/finance/gl/trial-balance",
    ),
  glBalanceSheet: () => financeApiFetch<unknown>("/api/finance/gl/balance-sheet"),
  glProfitLoss: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return financeApiFetch<unknown>(`/api/finance/gl/profit-loss${qs ? `?${qs}` : ""}`);
  },
  glAccountLedger: (accountCode: string) =>
    financeApiFetch<unknown>(`/api/finance/gl/general-ledger/${encodeURIComponent(accountCode)}`),
  postGlEntry: (body: Record<string, unknown>) =>
    financeApiFetch<import("./finance-api-types").ApiJournalEntry>("/api/finance/gl/entries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  arInvoices: () => financeApiFetch<{ invoices: unknown[] }>("/api/finance/ar/invoices"),
  apBills: () => financeApiFetch<{ bills: unknown[] }>("/api/finance/ap/bills"),
  arAging: () => financeApiFetch<Record<string, number>>("/api/finance/ar/aging"),
  apAging: () => financeApiFetch<Record<string, number>>("/api/finance/ap/aging"),
  report: (reportId: string, q?: Record<string, string>) => {
    const params = new URLSearchParams(q);
    const qs = params.toString();
    return financeApiFetch<unknown>(`/api/finance/reports/${reportId}${qs ? `?${qs}` : ""}`);
  },
  extendedHealth: () => financeApiFetch<unknown>("/api/finance/system/health"),
  reverseGlEntry: (id: string) =>
    financeApiFetch<import("./finance-api-types").ApiJournalEntry>(
      `/api/finance/gl/entries/${encodeURIComponent(id)}/reverse`,
      { method: "POST", body: "{}" },
    ),
  bankTransactions: (q?: Record<string, string>) => {
    const params = new URLSearchParams(q);
    const qs = params.toString();
    return financeApiFetch<{ transactions: unknown[] }>(
      `/api/finance/bank-transactions${qs ? `?${qs}` : ""}`,
    );
  },
  assets: () => financeApiFetch<{ assets: unknown[] }>("/api/finance/assets"),
  budgets: () => financeApiFetch<{ plans: unknown[] }>("/api/finance/budgets"),
  budgetVariance: (fiscalYear: number) =>
    financeApiFetch<unknown>(`/api/finance/budgets/variance-report?fiscalYear=${fiscalYear}`),
  taxSummary: (from: string, to: string) =>
    financeApiFetch<unknown>(
      `/api/finance/tax/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  fxRevaluations: () => financeApiFetch<unknown>("/api/finance/fx/revaluations"),
  revRecDashboard: () =>
    financeApiFetch<import("./finance-api-types").RevRecWipDashboard>("/api/finance/rev-rec/dashboard"),
  triggerRevRecMilestone: (body: { milestoneId: string; idempotencyKey?: string }) =>
    financeApiFetch<{ milestone: unknown; journalEntryId: string | null; duplicate: boolean }>(
      "/api/finance/rev-rec/trigger-milestone",
      { method: "POST", body: JSON.stringify(body) },
    ),
  wipLedger: () => financeApiFetch<import("./finance-api-types").WipLedgerDashboard>("/api/finance/wip/ledger"),
  capitalizeWip: (body: Record<string, unknown>) =>
    financeApiFetch<{ journalEntryId: string | null; duplicate: boolean; skipped?: boolean }>(
      "/api/finance/wip/capitalize",
      { method: "POST", body: JSON.stringify(body) },
    ),
};
