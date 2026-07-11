import { isDemoMode } from "./demo-mode";
import { readStorage, subscribeStorage, uid, writeStorage } from "./storage";
import { publishErpChange } from "./erp-sync";

export type ApBillStatus = "draft" | "open" | "partial" | "paid" | "void";

export type ApLine = {
  sku?: string;
  description: string;
  qty: number;
  unitCost: number;
  expenseAccount?: string;
};

export type ApBill = {
  id: string;
  billNumber: string;
  vendorCode: string;
  vendorName: string;
  poId?: string;
  lines: ApLine[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: ApBillStatus;
  billDate: string;
  dueDate: string;
  recurringId?: string;
};

export type ApPayment = {
  id: string;
  vendorCode: string;
  amount: number;
  billIds: string[];
  scheduledAt: string;
  paidAt?: string;
  method: "check" | "ach" | "wire";
};

export type RecurringBill = {
  id: string;
  vendorCode: string;
  vendorName: string;
  description: string;
  amount: number;
  cadence: "monthly" | "quarterly";
  nextDue: string;
  expenseAccount: string;
};

export type ApCredit = {
  id: string;
  vendorCode: string;
  amount: number;
  reason: string;
  at: string;
};

const KEY = "benben.ap.v1";

type Store = {
  bills: ApBill[];
  payments: ApPayment[];
  recurring: RecurringBill[];
  credits: ApCredit[];
};

function empty(): Store {
  return { bills: [], payments: [], recurring: [], credits: [] };
}

function seed(): Store {
  const bill: ApBill = {
    id: uid("bill"),
    billNumber: "BILL-2026-0088",
    vendorCode: "V-2210",
    vendorName: "Wafertek Materials",
    poId: undefined,
    lines: [{ description: "Substrate lot", qty: 120, unitCost: 420 }],
    subtotal: 50400,
    tax: 0,
    total: 50400,
    amountPaid: 20000,
    balance: 30400,
    status: "partial",
    billDate: "2026-05-02",
    dueDate: "2026-06-01",
  };
  return {
    bills: [bill],
    payments: [],
    recurring: [
      {
        id: uid("rec"),
        vendorCode: "V-3301",
        vendorName: "Pacific Photonics",
        description: "Facility maintenance contract",
        amount: 2400,
        cadence: "monthly",
        nextDue: "2026-06-01",
        expenseAccount: "6100",
      },
    ],
    credits: [],
  };
}

function load(): Store {
  if (!isDemoMode()) return readStorage(KEY, empty());
  const s = readStorage<Store | null>(KEY, null);
  if (s?.bills?.length) return s;
  const initial = seed();
  writeStorage(KEY, initial);
  return initial;
}

let cache = load();

function save(next: Store) {
  cache = next;
  writeStorage(KEY, next);
  publishErpChange("ap", "updated");
  publishErpChange("dashboard", "ap-updated");
}

export function resetApStore(): void {
  cache = empty();
  writeStorage(KEY, cache);
}

export function subscribeAp(fn: () => void) {
  return subscribeStorage(KEY, fn);
}

export function getApBills(): ApBill[] {
  return cache.bills;
}

export function getApPayments(): ApPayment[] {
  return cache.payments;
}

export function getRecurringBills(): RecurringBill[] {
  return cache.recurring;
}

export function getVendorBalance(vendorCode: string): number {
  return cache.bills
    .filter((b) => b.vendorCode === vendorCode && b.status !== "paid" && b.status !== "void")
    .reduce((s, b) => s + b.balance, 0);
}

export function getApDashboard(): {
  openBalance: number;
  dueThisWeek: number;
  overdue: number;
  scheduledPayments: number;
} {
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const open = cache.bills.filter((b) => b.status === "open" || b.status === "partial");
  return {
    openBalance: open.reduce((s, b) => s + b.balance, 0),
    dueThisWeek: open.filter((b) => b.dueDate <= week && b.dueDate >= today).reduce((s, b) => s + b.balance, 0),
    overdue: open.filter((b) => b.dueDate < today).reduce((s, b) => s + b.balance, 0),
    scheduledPayments: cache.payments.filter((p) => !p.paidAt).length,
  };
}

export function getApAging(): { current: number; d30: number; d60: number; d90: number; d90plus: number } {
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const today = Date.now();
  for (const b of cache.bills) {
    if (b.balance <= 0) continue;
    const days = Math.floor((today - new Date(b.dueDate).getTime()) / 86_400_000);
    if (days <= 0) buckets.current += b.balance;
    else if (days <= 30) buckets.d30 += b.balance;
    else if (days <= 60) buckets.d60 += b.balance;
    else if (days <= 90) buckets.d90 += b.balance;
    else buckets.d90plus += b.balance;
  }
  return buckets;
}

export function createBill(input: Omit<ApBill, "id" | "billNumber" | "amountPaid" | "balance" | "status">): ApBill {
  const bill: ApBill = {
    ...input,
    id: uid("bill"),
    billNumber: `BILL-${new Date().getFullYear()}-${String(cache.bills.length + 1).padStart(4, "0")}`,
    amountPaid: 0,
    balance: input.total,
    status: "open",
  };
  save({ ...cache, bills: [bill, ...cache.bills] });
  publishErpChange("gl", "ap-bill");
  return bill;
}

export function schedulePayment(
  vendorCode: string,
  billIds: string[],
  amount: number,
  scheduledAt: string,
  method: ApPayment["method"],
): ApPayment {
  const payment: ApPayment = {
    id: uid("appay"),
    vendorCode,
    amount,
    billIds,
    scheduledAt,
    method,
  };
  save({ ...cache, payments: [payment, ...cache.payments] });
  return payment;
}

export function payBill(billId: string, amount: number, method: ApPayment["method"]): void {
  const bills = cache.bills.map((b) => {
    if (b.id !== billId) return b;
    const amountPaid = b.amountPaid + amount;
    const balance = Math.max(0, b.total - amountPaid);
    const status: ApBillStatus = balance <= 0.01 ? "paid" : "partial";
    return { ...b, amountPaid, balance, status };
  });
  save({ ...cache, bills });
  publishErpChange("gl", "ap-payment");
}

export function createApCredit(vendorCode: string, amount: number, reason: string): ApCredit {
  const credit: ApCredit = {
    id: uid("apc"),
    vendorCode,
    amount,
    reason,
    at: new Date().toISOString().slice(0, 10),
  };
  save({ ...cache, credits: [credit, ...cache.credits] });
  return credit;
}
