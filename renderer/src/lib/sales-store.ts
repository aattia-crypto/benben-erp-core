import { publishErpChange } from "./erp-sync";
import * as salesBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";
import { uid } from "./storage";

export type SalesDocStatus = salesBridge.SalesDocStatus;
export type SalesLine = salesBridge.SalesLine;
export type SalesQuote = salesBridge.SalesQuote;
export type SalesOrder = salesBridge.SalesOrder;
export type SalesInvoice = salesBridge.SalesInvoice;

type Store = salesBridge.SalesState;

const listeners = new Set<() => void>();
let cache: Store = { quotes: [], orders: [], invoices: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function empty(): Store {
  return { quotes: [], orders: [], invoices: [] };
}

function lineTotals(lines: SalesLine[]) {
  return lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
}

function emit() {
  listeners.forEach((fn) => fn());
  publishErpChange("sales", "updated");
}

function applyCache(next: Store) {
  cache = next;
  emit();
}

export function resetSalesStore(): void {
  cache = empty();
  hydrated = false;
  hydratePromise = null;
  emit();
}

export function subscribeSales(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function invalidateSalesHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydrateSalesStore(): Promise<void> {
  if (!isOperationsBackend()) {
    return;
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = salesBridge.fetchSalesState().then((state) => {
      cache = state;
      hydrated = true;
      emit();
    }).catch((err) => {
      hydratePromise = null;
      throw err;
    });
  }
  await hydratePromise;
}

function ensureHydrationKickoff(): void {
  if (!isOperationsBackend() || hydrated || hydratePromise) return;
  void hydrateSalesStore();
}

export function getQuotes(): SalesQuote[] {
  ensureHydrationKickoff();
  return cache.quotes;
}

export function getSalesOrders(): SalesOrder[] {
  ensureHydrationKickoff();
  return cache.orders;
}

export function getSalesInvoices(): SalesInvoice[] {
  ensureHydrationKickoff();
  return cache.invoices;
}

export function createQuote(
  input: Omit<SalesQuote, "id" | "quoteNumber" | "subtotal" | "total" | "createdAt">,
): SalesQuote {
  const subtotal = lineTotals(input.lines);
  const total = subtotal + input.tax + input.shipping - input.discount;
  const quote: SalesQuote = {
    ...input,
    id: uid("qt"),
    quoteNumber: `QT-${new Date().getFullYear()}-${String(cache.quotes.length + 1).padStart(4, "0")}`,
    subtotal,
    total,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  const previous = cache;
  applyCache({ ...cache, quotes: [quote, ...cache.quotes] });

  if (!isOperationsBackend()) return quote;

  persistInBackground(
    "sales-store",
    async () => {
      const saved = await salesBridge.createQuoteRemote(quote);
      applyCache({
        ...cache,
        quotes: [saved, ...cache.quotes.filter((q) => q.id !== quote.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return quote;
}

export function convertQuoteToOrder(quoteId: string): SalesOrder | null {
  const quote = cache.quotes.find((q) => q.id === quoteId);
  if (!quote) return null;

  const order: SalesOrder = {
    id: uid("so"),
    orderNumber: `SO-${new Date().getFullYear()}-${String(cache.orders.length + 1).padStart(4, "0")}`,
    quoteId,
    customerCode: quote.customerCode,
    customerName: quote.customerName,
    lines: quote.lines,
    subtotal: quote.subtotal,
    tax: quote.tax,
    shipping: quote.shipping,
    discount: quote.discount,
    total: quote.total,
    terms: quote.terms,
    status: "open",
    createdAt: new Date().toISOString().slice(0, 10),
  };
  const previous = cache;
  const quotes = cache.quotes.map((q) => (q.id === quoteId ? { ...q, status: "fulfilled" as const } : q));
  applyCache({ ...cache, quotes, orders: [order, ...cache.orders] });

  if (!isOperationsBackend()) return order;

  persistInBackground(
    "sales-store",
    async () => {
      const saved = await salesBridge.convertQuoteToOrderRemote(quoteId);
      if (!saved) {
        cache = previous;
        emit();
        return;
      }
      applyCache({
        quotes: cache.quotes.map((q) => (q.id === quoteId ? { ...q, status: "fulfilled" as const } : q)),
        orders: [saved, ...cache.orders.filter((o) => o.id !== order.id)],
        invoices: cache.invoices,
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return order;
}

export function convertOrderToInvoice(orderId: string): SalesInvoice | null {
  const order = cache.orders.find((o) => o.id === orderId);
  if (!order) return null;

  const due = new Date();
  due.setDate(due.getDate() + 30);
  const invoice: SalesInvoice = {
    id: uid("si"),
    invoiceNumber: `SI-${new Date().getFullYear()}-${String(cache.invoices.length + 1).padStart(4, "0")}`,
    orderId,
    customerCode: order.customerCode,
    customerName: order.customerName,
    lines: order.lines,
    subtotal: order.subtotal,
    tax: order.tax,
    shipping: order.shipping,
    discount: order.discount,
    total: order.total,
    terms: order.terms,
    status: "open",
    issuedAt: new Date().toISOString().slice(0, 10),
    dueAt: due.toISOString().slice(0, 10),
    amountPaid: 0,
  };
  const previous = cache;
  const orders = cache.orders.map((o) => (o.id === orderId ? { ...o, status: "invoiced" as const } : o));
  applyCache({ ...cache, orders, invoices: [invoice, ...cache.invoices] });

  if (!isOperationsBackend()) return invoice;

  persistInBackground(
    "sales-store",
    async () => {
      const saved = await salesBridge.convertOrderToInvoiceRemote(orderId);
      if (!saved) {
        cache = previous;
        emit();
        return;
      }
      applyCache({
        quotes: cache.quotes,
        orders: cache.orders.map((o) => (o.id === orderId ? { ...o, status: "invoiced" as const } : o)),
        invoices: [saved, ...cache.invoices.filter((i) => i.id !== invoice.id)],
      });
    },
    () => {
      cache = previous;
    },
    emit,
  );
  return invoice;
}
