import { isDesktopShell } from "./desktop-api";
import { getDemoVendorLedger } from "./demo-data-provider";
import { isDemoBuild } from "./demo-build";
import { financeHealthCheck } from "./finance-api-client";
import {
  createApCredit as createLocalApCredit,
  createBill as createLocalBill,
  getApBills as getLocalBills,
  getApDashboard as getLocalApDashboard,
  getApAging as getLocalApAging,
  payBill as payLocalBill,
  schedulePayment as scheduleLocalPayment,
  type ApBill,
} from "./ap-store";
import { publishErpChange } from "./erp-sync";

let apiAvailable: boolean | null = null;

async function checkApi(): Promise<boolean> {
  if (!isDesktopShell()) {
    apiAvailable = false;
    return false;
  }
  if (apiAvailable === null) apiAvailable = await financeHealthCheck();
  return apiAvailable;
}

async function financeApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { financeApiFetch: fetchFn } = await import("./finance-api-client");
  return fetchFn<T>(path, init);
}

function mapDbBill(b: Record<string, unknown>): ApBill {
  return {
    id: String(b.id),
    billNumber: String(b.billNumber),
    vendorCode: String(b.vendorCode),
    vendorName: String(b.vendorName),
    poId: b.poId ? String(b.poId) : undefined,
    lines: JSON.parse(String(b.linesJson ?? "[]")) as ApBill["lines"],
    subtotal: Number(b.subtotal),
    tax: Number(b.tax),
    total: Number(b.total),
    amountPaid: Number(b.amountPaid),
    balance: Number(b.balance),
    status: String(b.status).toLowerCase() as ApBill["status"],
    billDate: String(b.billDate).slice(0, 10),
    dueDate: String(b.dueDate).slice(0, 10),
  };
}

export async function fetchApBillsBridge(): Promise<{ bills: ApBill[]; source: string }> {
  if (await checkApi()) {
    try {
      const { bills } = await financeApiFetch<{ bills: unknown[] }>("/api/finance/ap/bills");
      return { bills: bills.map((b) => mapDbBill(b as Record<string, unknown>)), source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  return { bills: getLocalBills(), source: "localStorage" };
}

export async function createApBillBridge(
  input: Parameters<typeof createLocalBill>[0] & { idempotencyKey?: string },
): Promise<ApBill> {
  if (await checkApi()) {
    try {
      const bill = await financeApiFetch<Record<string, unknown>>("/api/finance/ap/bills", {
        method: "POST",
        body: JSON.stringify(input),
      });
      publishErpChange("ap", "bill-created", String(bill.id));
      return mapDbBill(bill);
    } catch {
      apiAvailable = false;
    }
  }
  return createLocalBill(input);
}

export async function getApDashboardBridge() {
  if (await checkApi()) {
    try {
      const { bills } = await financeApiFetch<{ bills: unknown[] }>("/api/finance/ap/bills");
      const mapped = bills.map((b) => mapDbBill(b as Record<string, unknown>));
      const today = new Date().toISOString().slice(0, 10);
      const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const open = mapped.filter((b) => b.status === "open" || b.status === "partial");
      return {
        openBalance: open.reduce((s, b) => s + b.balance, 0),
        dueThisWeek: open.filter((b) => b.dueDate <= week && b.dueDate >= today).reduce((s, b) => s + b.balance, 0),
        overdue: open.filter((b) => b.dueDate < today).reduce((s, b) => s + b.balance, 0),
        scheduledPayments: 0,
        source: "database",
      };
    } catch {
      apiAvailable = false;
    }
  }
  return { ...getLocalApDashboard(), source: "localStorage" };
}

export async function getApAgingBridge() {
  if (await checkApi()) {
    try {
      const buckets = await financeApiFetch<Record<string, number>>("/api/finance/ap/aging");
      return { ...buckets, source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  return { ...getLocalApAging(), source: "localStorage" };
}

export async function payApBillBridge(
  billId: string,
  amount: number,
  method: string,
  memo?: string,
): Promise<void> {
  if (await checkApi()) {
    try {
      await financeApiFetch("/api/finance/ap/payments", {
        method: "POST",
        body: JSON.stringify({ billId, amount, method, memo }),
      });
      publishErpChange("ap", "payment-applied");
      return;
    } catch {
      apiAvailable = false;
    }
  }
  payLocalBill(billId, amount, method as Parameters<typeof payLocalBill>[2]);
}

export async function scheduleApPaymentBridge(
  vendorCode: string,
  billIds: string[],
  amount: number,
  dueDate: string,
  method: string,
): Promise<void> {
  scheduleLocalPayment(vendorCode, billIds, amount, dueDate, method as Parameters<typeof scheduleLocalPayment>[4]);
}

export async function createApVendorCreditBridge(
  vendorCode: string,
  amount: number,
  reason: string,
  billId?: string,
): Promise<void> {
  if (await checkApi()) {
    try {
      await financeApiFetch("/api/finance/ap/vendor-credits", {
        method: "POST",
        body: JSON.stringify({ vendorCode, amount, reason, billId }),
      });
      publishErpChange("ap", "vendor-credit");
      return;
    } catch {
      apiAvailable = false;
    }
  }
  createLocalApCredit(vendorCode, amount, reason);
  publishErpChange("ap", "vendor-credit");
}

export type ApBillDetail = Record<string, unknown>;

export async function fetchApBillDetailBridge(
  billId: string,
): Promise<{ detail: ApBillDetail | null; source: string }> {
  if (await checkApi()) {
    try {
      const detail = await financeApiFetch<ApBillDetail>(
        `/api/finance/ap/bills/${encodeURIComponent(billId)}`,
      );
      return { detail, source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  const bill = getLocalBills().find((b) => b.id === billId);
  if (!bill) return { detail: null, source: "localStorage" };
  return {
    detail: {
      ...bill,
      linesJson: JSON.stringify(bill.lines),
      journalEntry: null,
      allocations: [],
      credits: [],
    },
    source: "localStorage",
  };
}

export function invalidateApApiCache(): void {
  apiAvailable = null;
}

export type VendorLedgerPayment = {
  id: string;
  vendorCode: string;
  amount: number;
  method: string;
  paidAt: string;
  memo?: string;
};

export type VendorLedgerResult = {
  bills: ApBill[];
  payments: VendorLedgerPayment[];
  balance: number;
  source: string;
};

function mapDbPayment(p: Record<string, unknown>): VendorLedgerPayment {
  return {
    id: String(p.id),
    vendorCode: String(p.vendorCode),
    amount: Number(p.amount),
    method: String(p.method),
    paidAt: p.paidAt ? String(p.paidAt).slice(0, 10) : "",
    memo: p.memo ? String(p.memo) : undefined,
  };
}

export async function fetchVendorLedgerBridge(vendorCode: string): Promise<VendorLedgerResult> {
  const code = vendorCode.trim().toUpperCase();

  // Presenter Mode: never wait on a dead finance API for a blank ledger.
  if (isDemoBuild()) {
    if (await checkApi()) {
      try {
        const data = await financeApiFetch<{
          bills: unknown[];
          payments: unknown[];
          balance: number;
        }>(`/api/finance/ap/ledger/${encodeURIComponent(code)}`);
        const result: VendorLedgerResult = {
          bills: data.bills.map((b) => mapDbBill(b as Record<string, unknown>)),
          payments: (data.payments ?? []).map((p) => mapDbPayment(p as Record<string, unknown>)),
          balance: Number(data.balance ?? 0),
          source: "database",
        };
        if (result.bills.length > 0 || result.payments.length > 0) {
          return result;
        }
      } catch {
        apiAvailable = null;
      }
    }
    return getDemoVendorLedger(code);
  }

  if (await checkApi()) {
    try {
      const data = await financeApiFetch<{
        bills: unknown[];
        payments: unknown[];
        balance: number;
      }>(`/api/finance/ap/ledger/${encodeURIComponent(code)}`);
      return {
        bills: data.bills.map((b) => mapDbBill(b as Record<string, unknown>)),
        payments: (data.payments ?? []).map((p) => mapDbPayment(p as Record<string, unknown>)),
        balance: Number(data.balance ?? 0),
        source: "database",
      };
    } catch {
      apiAvailable = null;
    }
  }

  const bills = getLocalBills().filter((b) => b.vendorCode.toUpperCase() === code);
  const open = bills.filter((b) => b.status === "open" || b.status === "partial");
  return {
    bills,
    payments: [],
    balance: open.reduce((sum, b) => sum + b.balance, 0),
    source: "localStorage",
  };
}
