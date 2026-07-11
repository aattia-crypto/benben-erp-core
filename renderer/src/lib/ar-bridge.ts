import { financeHealthCheck } from "./finance-api-client";
import { isDesktopShell } from "./desktop-api";
import {
  applyPayment as applyLocalPayment,
  createArInvoice as createLocalArInvoice,
  createCreditMemo as createLocalCreditMemo,
  getArInvoices as getLocalArInvoices,
  getArDashboard as getLocalArDashboard,
  getAgingReport as getLocalAging,
  getCustomerStatement,
  type ArInvoice,
  type ArPayment,
  type CreateArInvoiceInput,
} from "./ar-store";
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

function mapDbInvoice(inv: Record<string, unknown>): ArInvoice {
  return {
    id: String(inv.id),
    invoiceNumber: String(inv.invoiceNumber),
    customerCode: String(inv.customerCode),
    customerName: String(inv.customerName),
    lines: JSON.parse(String(inv.linesJson ?? "[]")) as ArInvoice["lines"],
    subtotal: Number(inv.subtotal),
    tax: Number(inv.tax),
    shipping: Number(inv.shipping),
    discount: Number(inv.discount),
    total: Number(inv.total),
    amountPaid: Number(inv.amountPaid),
    balance: Number(inv.balance),
    status: String(inv.status).toLowerCase() as ArInvoice["status"],
    terms: String(inv.terms ?? ""),
    issuedAt: String(inv.issuedAt).slice(0, 10),
    dueAt: String(inv.dueAt).slice(0, 10),
    source: inv.source as ArInvoice["source"],
    sourceRef: inv.sourceRef ? String(inv.sourceRef) : undefined,
  };
}

export async function fetchArInvoicesBridge(): Promise<{ invoices: ArInvoice[]; source: string }> {
  if (await checkApi()) {
    try {
      const { invoices } = await financeApiFetch<{ invoices: unknown[] }>("/api/finance/ar/invoices");
      return { invoices: invoices.map((i) => mapDbInvoice(i as Record<string, unknown>)), source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  return { invoices: getLocalArInvoices(), source: "localStorage" };
}

async function financeApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { financeApiFetch: fetchFn } = await import("./finance-api-client");
  return fetchFn<T>(path, init);
}

export async function createArInvoiceBridge(
  input: CreateArInvoiceInput & { idempotencyKey?: string },
): Promise<ArInvoice> {
  if (await checkApi()) {
    try {
      const inv = await financeApiFetch<Record<string, unknown>>("/api/finance/ar/invoices", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          issuedAt: input.issuedAt,
          dueAt: input.dueAt,
          idempotencyKey: input.idempotencyKey,
        }),
      });
      publishErpChange("ar", "invoice-created", String(inv.id));
      return mapDbInvoice(inv);
    } catch {
      apiAvailable = false;
    }
  }
  return createLocalArInvoice(input);
}

export async function getArDashboardBridge() {
  if (await checkApi()) {
    try {
      const invoices = (await financeApiFetch<{ invoices: unknown[] }>("/api/finance/ar/invoices")).invoices;
      const mapped = invoices.map((i) => mapDbInvoice(i as Record<string, unknown>));
      const today = new Date().toISOString().slice(0, 10);
      const open = mapped.filter((i) => i.status === "open" || i.status === "partial");
      return {
        openBalance: open.reduce((s, i) => s + i.balance, 0),
        overdueBalance: open.filter((i) => i.dueAt < today).reduce((s, i) => s + i.balance, 0),
        unappliedPayments: 0,
        openCount: open.length,
        source: "database",
      };
    } catch {
      apiAvailable = false;
    }
  }
  return { ...getLocalArDashboard(), source: "localStorage" };
}

export async function getArAgingBridge() {
  if (await checkApi()) {
    try {
      const buckets = await financeApiFetch<Record<string, number>>("/api/finance/ar/aging");
      return { ...buckets, source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  return { ...getLocalAging(), source: "localStorage" };
}

export async function applyArPaymentBridge(
  customerCode: string,
  amount: number,
  allocations: { invoiceId: string; amount: number }[],
  method: ArPayment["method"],
  memo?: string,
): Promise<void> {
  if (await checkApi()) {
    try {
      await financeApiFetch("/api/finance/ar/payments", {
        method: "POST",
        body: JSON.stringify({ customerCode, amount, allocations, method, memo }),
      });
      publishErpChange("ar", "payment-applied");
      return;
    } catch {
      apiAvailable = false;
    }
  }
  applyLocalPayment(customerCode, amount, allocations, method, memo);
}

export async function createArCreditMemoBridge(
  customerCode: string,
  amount: number,
  reason: string,
  invoiceId?: string,
): Promise<void> {
  if (await checkApi()) {
    try {
      await financeApiFetch("/api/finance/ar/credit-memos", {
        method: "POST",
        body: JSON.stringify({ customerCode, amount, reason, invoiceId }),
      });
      publishErpChange("ar", "credit-memo");
      return;
    } catch {
      apiAvailable = false;
    }
  }
  createLocalCreditMemo(customerCode, amount, reason, invoiceId);
  publishErpChange("ar", "credit-memo");
}

export type ArInvoiceDetail = Record<string, unknown>;

export async function fetchArInvoiceDetailBridge(
  invoiceId: string,
): Promise<{ detail: ArInvoiceDetail | null; source: string }> {
  if (await checkApi()) {
    try {
      const detail = await financeApiFetch<ArInvoiceDetail>(
        `/api/finance/ar/invoices/${encodeURIComponent(invoiceId)}`,
      );
      return { detail, source: "database" };
    } catch {
      apiAvailable = false;
    }
  }
  const inv = getLocalArInvoices().find((i) => i.id === invoiceId);
  if (!inv) return { detail: null, source: "localStorage" };
  return {
    detail: {
      ...inv,
      linesJson: JSON.stringify(inv.lines),
      journalEntry: null,
      allocations: [],
      creditMemos: [],
    },
    source: "localStorage",
  };
}

export function invalidateArApiCache(): void {
  apiAvailable = null;
}

export { getCustomerStatement };
