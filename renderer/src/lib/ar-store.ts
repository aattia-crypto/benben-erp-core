import { isDemoMode } from "./demo-mode";
import { readStorage, subscribeStorage, uid, writeStorage } from "./storage";
import { publishErpChange } from "./erp-sync";

export type ArInvoiceStatus = "draft" | "open" | "partial" | "paid" | "void";

export type ArLine = {
  sku: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type ArInvoice = {
  id: string;
  invoiceNumber: string;
  customerCode: string;
  customerName: string;
  lines: ArLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: ArInvoiceStatus;
  terms: string;
  issuedAt: string;
  dueAt: string;
  sourceRef?: string;
  source?: "sales" | "pos" | "manual";
};

export type ArPayment = {
  id: string;
  customerCode: string;
  amount: number;
  applied: { invoiceId: string; amount: number }[];
  unapplied: number;
  method: "check" | "ach" | "card" | "cash";
  at: string;
  memo?: string;
};

export type ArCreditMemo = {
  id: string;
  customerCode: string;
  invoiceId?: string;
  amount: number;
  reason: string;
  at: string;
};

export type ArFinanceCharge = {
  id: string;
  customerCode: string;
  amount: number;
  ratePct: number;
  at: string;
};

export type CollectionNote = {
  id: string;
  customerCode: string;
  note: string;
  at: string;
};

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "d90plus";

const KEY = "benben.ar.v1";

type Store = {
  invoices: ArInvoice[];
  payments: ArPayment[];
  creditMemos: ArCreditMemo[];
  financeCharges: ArFinanceCharge[];
  collectionNotes: CollectionNote[];
};

function empty(): Store {
  return { invoices: [], payments: [], creditMemos: [], financeCharges: [], collectionNotes: [] };
}

function seed(): Store {
  const issued = "2026-05-01";
  const inv: ArInvoice = {
    id: uid("inv"),
    invoiceNumber: "AR-2026-0105",
    customerCode: "C-DEMO-01",
    customerName: "Northstar Devices",
    lines: [{ sku: "SF-A7-W", description: "SF-A7 Wafer", qty: 4, unitPrice: 1850 }],
    subtotal: 7400,
    tax: 647.5,
    shipping: 120,
    discount: 0,
    total: 8167.5,
    amountPaid: 4000,
    balance: 4167.5,
    status: "partial",
    terms: "Net 30",
    issuedAt: issued,
    dueAt: "2026-05-31",
    source: "sales",
  };
  return {
    invoices: [inv],
    payments: [
      {
        id: uid("pay"),
        customerCode: "C-DEMO-01",
        amount: 4000,
        applied: [{ invoiceId: inv.id, amount: 4000 }],
        unapplied: 0,
        method: "ach",
        at: "2026-05-10",
      },
    ],
    creditMemos: [],
    financeCharges: [],
    collectionNotes: [{ id: uid("cn"), customerCode: "C-DEMO-01", note: "Called AP — payment promised 5/20", at: "2026-05-12" }],
  };
}

function load(): Store {
  if (!isDemoMode()) return readStorage(KEY, empty());
  const s = readStorage<Store | null>(KEY, null);
  if (s?.invoices?.length) return s;
  const initial = seed();
  writeStorage(KEY, initial);
  return initial;
}

let cache = load();

function save(next: Store) {
  cache = next;
  writeStorage(KEY, next);
  publishErpChange("ar", "updated");
  publishErpChange("dashboard", "ar-updated");
}

export function resetArStore(): void {
  cache = empty();
  writeStorage(KEY, cache);
}

export function subscribeAr(fn: () => void) {
  return subscribeStorage(KEY, fn);
}

export function getArInvoices(): ArInvoice[] {
  return cache.invoices;
}

export function getArPayments(): ArPayment[] {
  return cache.payments;
}

export function getCreditMemos(): ArCreditMemo[] {
  return cache.creditMemos;
}

export function getCollectionNotes(customerCode?: string): CollectionNote[] {
  return customerCode
    ? cache.collectionNotes.filter((n) => n.customerCode === customerCode)
    : cache.collectionNotes;
}

export function getCustomerBalance(customerCode: string): number {
  return cache.invoices
    .filter((i) => i.customerCode === customerCode && i.status !== "void" && i.status !== "paid")
    .reduce((s, i) => s + i.balance, 0);
}

export function getArDashboard(): {
  openBalance: number;
  overdueBalance: number;
  unappliedPayments: number;
  openCount: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const open = cache.invoices.filter((i) => i.status === "open" || i.status === "partial");
  return {
    openBalance: open.reduce((s, i) => s + i.balance, 0),
    overdueBalance: open.filter((i) => i.dueAt < today).reduce((s, i) => s + i.balance, 0),
    unappliedPayments: cache.payments.reduce((s, p) => s + p.unapplied, 0),
    openCount: open.length,
  };
}

function agingDays(dueAt: string): number {
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  return Math.floor((now - due) / 86_400_000);
}

export function getAgingReport(): Record<AgingBucket, number> {
  const buckets: Record<AgingBucket, number> = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  for (const inv of cache.invoices) {
    if (inv.balance <= 0 || inv.status === "void" || inv.status === "paid") continue;
    const days = agingDays(inv.dueAt);
    if (days <= 0) buckets.current += inv.balance;
    else if (days <= 30) buckets.d30 += inv.balance;
    else if (days <= 60) buckets.d60 += inv.balance;
    else if (days <= 90) buckets.d90 += inv.balance;
    else buckets.d90plus += inv.balance;
  }
  return buckets;
}

export type CreateArInvoiceInput = Omit<
  ArInvoice,
  "id" | "invoiceNumber" | "amountPaid" | "balance" | "status"
> & { status?: ArInvoiceStatus };

export function createArInvoice(input: CreateArInvoiceInput): ArInvoice {
  const total =
    input.subtotal + input.tax + input.shipping - input.discount;
  const inv: ArInvoice = {
    ...input,
    id: uid("inv"),
    invoiceNumber: `AR-${new Date().getFullYear()}-${String(cache.invoices.length + 1).padStart(4, "0")}`,
    total,
    amountPaid: 0,
    balance: total,
    status: input.status ?? "open",
  };
  save({ ...cache, invoices: [inv, ...cache.invoices] });
  return inv;
}

export function applyPayment(
  customerCode: string,
  amount: number,
  allocations: { invoiceId: string; amount: number }[],
  method: ArPayment["method"],
  memo?: string,
): ArPayment {
  let remaining = amount;
  const invoices = cache.invoices.map((inv) => {
    const alloc = allocations.find((a) => a.invoiceId === inv.id);
    if (!alloc) return inv;
    const applied = Math.min(alloc.amount, inv.balance, remaining);
    remaining -= applied;
    const amountPaid = inv.amountPaid + applied;
    const balance = inv.total - amountPaid;
    const status: ArInvoiceStatus =
      balance <= 0.01 ? "paid" : amountPaid > 0 ? "partial" : inv.status;
    return { ...inv, amountPaid, balance: Math.max(0, balance), status };
  });
  const payment: ArPayment = {
    id: uid("pay"),
    customerCode,
    amount,
    applied: allocations,
    unapplied: Math.max(0, remaining),
    method,
    at: new Date().toISOString().slice(0, 10),
    memo,
  };
  save({ ...cache, invoices, payments: [payment, ...cache.payments] });
  publishErpChange("gl", "cash-receipt");
  return payment;
}

export function createCreditMemo(
  customerCode: string,
  amount: number,
  reason: string,
  invoiceId?: string,
): ArCreditMemo {
  const memo: ArCreditMemo = {
    id: uid("cm"),
    customerCode,
    invoiceId,
    amount,
    reason,
    at: new Date().toISOString().slice(0, 10),
  };
  let invoices = cache.invoices;
  if (invoiceId) {
    invoices = cache.invoices.map((inv) => {
      if (inv.id !== invoiceId) return inv;
      const balance = Math.max(0, inv.balance - amount);
      return {
        ...inv,
        balance,
        status: balance <= 0.01 ? "paid" : inv.status,
      };
    });
  }
  save({ ...cache, invoices, creditMemos: [memo, ...cache.creditMemos] });
  return memo;
}

export function addFinanceCharge(customerCode: string, ratePct: number): ArFinanceCharge {
  const balance = getCustomerBalance(customerCode);
  const amount = Math.round(balance * (ratePct / 100) * 100) / 100;
  const fc: ArFinanceCharge = {
    id: uid("fc"),
    customerCode,
    amount,
    ratePct,
    at: new Date().toISOString().slice(0, 10),
  };
  save({ ...cache, financeCharges: [fc, ...cache.financeCharges] });
  return fc;
}

export function addCollectionNote(customerCode: string, note: string): CollectionNote {
  const n: CollectionNote = {
    id: uid("col"),
    customerCode,
    note,
    at: new Date().toISOString(),
  };
  save({ ...cache, collectionNotes: [n, ...cache.collectionNotes] });
  return n;
}

export function getCustomerStatement(customerCode: string): {
  invoices: ArInvoice[];
  payments: ArPayment[];
  balance: number;
} {
  return {
    invoices: cache.invoices.filter((i) => i.customerCode === customerCode),
    payments: cache.payments.filter((p) => p.customerCode === customerCode),
    balance: getCustomerBalance(customerCode),
  };
}
