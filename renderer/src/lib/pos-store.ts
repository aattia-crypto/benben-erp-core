// POS store — optimistic in-memory cache with PostgreSQL persistence via IPC.

import { journal, type JournalEntry } from "./mock-data";
import { notifyBackupEvent } from "./backup-engine";
import { randomUUID } from "./uuid";
import { calcTax } from "./pos-tax";
import { earnPoints } from "./pos-loyalty";
import {
  emptyStockMap,
  getLocations,
  getStores,
  locationIds,
  subscribeLocations,
  type StockLocation,
} from "./location-store";
import { publishErpChange } from "./erp-sync";
import { getPosProductsFromCatalog } from "./product-catalog";
import * as posBridge from "./operations-bridge";
import { isOperationsBackend, persistInBackground } from "./store-persist";

export interface Product {
  sku: string;
  name: string;
  category: "Wafer" | "Module" | "Sensor" | "Service" | "Accessory";
  price: number;
  barcode?: string;
  qrCode?: string;
  stock: Record<string, number>;
}

export function getPosLocations(): StockLocation[] {
  return getLocations();
}

/** @deprecated Prefer getPosLocations — kept for existing imports. */
export const locations = getStores().map((l) => ({ id: l.id, label: l.label }));

export type LocationId = string;

function baseStock(): Record<string, number> {
  return emptyStockMap();
}

function syncProductStock(p: Product): Product {
  const ids = locationIds();
  const stock = { ...p.stock };
  for (const id of ids) {
    if (stock[id] === undefined) stock[id] = Math.floor(40 + Math.random() * 120);
  }
  return { ...p, stock };
}

const rawProducts: Product[] = [
  { sku: "SF-A7-W", name: "SF-A7 Wafer (each)", category: "Wafer", price: 1850, barcode: "0194250000012", qrCode: "QR-SF-A7-W", stock: baseStock() },
  { sku: "SF-X3-M", name: "SF-X3 Module", category: "Module", price: 4200, barcode: "0194250000029", qrCode: "QR-SF-X3-M", stock: baseStock() },
  { sku: "SF-Q9-S", name: "SF-Q9 Sensor Array", category: "Sensor", price: 980, barcode: "0194250000036", stock: baseStock() },
  { sku: "SF-K2-S", name: "SF-K2 Sensor", category: "Sensor", price: 320, barcode: "0194250000043", stock: baseStock() },
  { sku: "SF-PCB8", name: "8L Carrier PCB", category: "Accessory", price: 65, barcode: "0194250000050", stock: baseStock() },
  { sku: "SF-DOP", name: "Boron Dopant Cell", category: "Accessory", price: 142, stock: baseStock() },
  { sku: "SF-CAB", name: "RF Cable Harness", category: "Accessory", price: 48, stock: baseStock() },
  { sku: "SF-CAL", name: "Calibration Service", category: "Service", price: 750, stock: baseStock() },
  { sku: "SF-INST", name: "On-site Install (hr)", category: "Service", price: 220, stock: baseStock() },
  { sku: "SF-WAR", name: "Extended Warranty", category: "Service", price: 410, stock: baseStock() },
  { sku: "SF-MNT", name: "Mount Kit", category: "Accessory", price: 89, stock: baseStock() },
  { sku: "SF-OPT", name: "Lumen Optic Lens", category: "Accessory", price: 178, stock: baseStock() },
];

export const products: Product[] = rawProducts.map(syncProductStock);

export function getPosProducts(): Product[] {
  const fromCatalog = getPosProductsFromCatalog();
  if (fromCatalog.length > 0) return fromCatalog;
  return products.map(syncProductStock);
}

export function findProductByScan(code: string): Product | undefined {
  const q = code.trim();
  const upper = q.toUpperCase();
  return getPosProducts().find(
    (p) =>
      p.sku.toUpperCase() === upper ||
      p.barcode === q ||
      p.qrCode?.toUpperCase() === upper ||
      p.qrCode?.toUpperCase() === `QR-${upper}`,
  );
}

export interface CartLine {
  sku: string;
  name: string;
  price: number;
  qty: number;
}

export type SaleStatus = posBridge.SaleStatus;
export interface PosSale {
  id: string;
  ref: string;
  date: string;
  locationId: LocationId;
  paymentMethod: "cash" | "ar" | "card";
  lines: CartLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: SaleStatus;
  reversed?: boolean;
  taxExempt?: boolean;
  customerCode?: string;
  customerName?: string;
}

type PosCache = { sales: PosSale[]; queue: string[] };

const listeners = new Set<() => void>();
let cache: PosCache = { sales: [], queue: [] };
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function applyPosCache(next: PosCache) {
  cache = next;
  emit();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  subscribeLocations(() => {
    for (let i = 0; i < products.length; i++) {
      products[i] = syncProductStock(products[i]);
    }
    emit();
  });
}

export function invalidatePosHydration(): void {
  hydrated = false;
  hydratePromise = null;
}

export async function hydratePosStore(): Promise<void> {
  if (!isOperationsBackend()) {
    return;
  }
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = posBridge.fetchPosState().then((state) => {
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
  void hydratePosStore();
}

export function getSales(): PosSale[] {
  ensureHydrationKickoff();
  return cache.sales;
}

export function getQueue(): string[] {
  ensureHydrationKickoff();
  return cache.queue;
}

function buildJournal(sale: PosSale): JournalEntry[] {
  const cashOrAr = sale.paymentMethod === "ar" ? "1100" : "1000";
  const entry: JournalEntry = {
    id: `j-pos-${sale.id}`,
    date: sale.date.slice(0, 10),
    ref: sale.ref,
    memo: `POS sale · ${sale.locationId} · ${sale.lines.length} line${sale.lines.length > 1 ? "s" : ""}`,
    source: "sales",
    posted: true,
    lines: [
      { account: cashOrAr, debit: sale.total, credit: 0 },
      { account: "4000", debit: 0, credit: sale.subtotal },
      ...(sale.tax > 0 ? [{ account: "2100", debit: 0, credit: sale.tax }] : []),
    ],
  };
  return [entry];
}

export function syncPosStockFromInventory(): void {
  void import("./inventory-store").then(({ getInventoryItems }) => {
    for (const item of getInventoryItems()) {
      const p = products.find((x) => x.sku === item.sku);
      if (p) p.stock["WH-MAIN"] = item.onHand;
    }
    emit();
  });
}

if (typeof window !== "undefined") {
  void import("./erp-sync").then(({ subscribeErpModule }) => {
    subscribeErpModule("inventory", () => syncPosStockFromInventory());
  });
}


export async function checkout(input: {
  locationId: LocationId;
  paymentMethod: "cash" | "ar" | "card";
  lines: CartLine[];
  online: boolean;
  taxExempt?: boolean;
  customer: { code: string; name: string };
}): Promise<PosSale> {
  const subtotal = input.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = calcTax(subtotal, input.locationId, !!input.taxExempt);
  const total = subtotal + tax;
  const id = randomUUID();
  const sale: PosSale = {
    id,
    ref: `POS-${Math.floor(100000 + Math.random() * 900000)}`,
    date: new Date().toISOString(),
    locationId: input.locationId,
    paymentMethod: input.paymentMethod,
    lines: input.lines,
    subtotal,
    tax,
    total,
    status: input.online ? "synced" : "queued",
    taxExempt: input.taxExempt,
    customerCode: input.customer.code,
    customerName: input.customer.name,
  };

  const catalog = getPosProducts();
  for (const line of input.lines) {
    const p = catalog.find((x) => x.sku === line.sku);
    if (p) p.stock[input.locationId] = Math.max(0, (p.stock[input.locationId] ?? 0) - line.qty);
  }

  const previous = { sales: [...cache.sales], queue: [...cache.queue] };
  const sales = [sale, ...cache.sales];
  const queue = sale.status === "queued" ? [...cache.queue, sale.id] : cache.queue;
  applyPosCache({ sales, queue });

  if (isOperationsBackend()) {
    try {
      const saved = await posBridge.savePosSaleRemote(sale);
      applyPosCache({
        sales: [saved, ...cache.sales.filter((s) => s.id !== sale.id)],
        queue:
          saved.status === "queued"
            ? [...cache.queue.filter((id) => id !== sale.id), saved.id]
            : cache.queue.filter((id) => id !== sale.id),
      });
      if (saved.status === "synced") {
        journal.unshift(...buildJournal(saved));
      }
      earnPoints(input.customer.code, Math.floor(saved.total / 10), saved.ref);
      void import("./inventory-store").then(({ adjustStock }) => {
        for (const line of input.lines) {
          adjustStock(line.sku, line.qty, "issue", `POS ${saved.ref}`);
        }
      });
      if (input.paymentMethod === "ar") {
        void import("./erp-integrations").then(({ integratePosArSale }) =>
          integratePosArSale(saved, input.customer.code, input.customer.name),
        );
      }
      publishErpChange("pos", "checkout", saved.id);
      notifyBackupEvent("POS checkout");
      return saved;
    } catch (err) {
      cache = previous;
      emit();
      throw err;
    }
  }

  if (sale.status === "synced") {
    journal.unshift(...buildJournal(sale));
  }
  earnPoints(input.customer.code, Math.floor(total / 10), sale.ref);
  void import("./inventory-store").then(({ adjustStock }) => {
    for (const line of input.lines) {
      adjustStock(line.sku, line.qty, "issue", `POS ${sale.ref}`);
    }
  });
  if (input.paymentMethod === "ar") {
    void import("./erp-integrations").then(({ integratePosArSale }) =>
      integratePosArSale(sale, input.customer.code, input.customer.name),
    );
  }
  publishErpChange("pos", "checkout", sale.id);
  notifyBackupEvent("POS checkout");
  return sale;
}

export function voidSale(
  saleId: string,
  reason: string,
  managerPin?: string,
): PosSale | null {
  const sale = reverseSale(saleId);
  if (sale) {
    void import("./pos-ops-store").then(({ recordVoid }) => recordVoid(sale.ref, reason, managerPin));
    publishErpChange("pos", "void", saleId);
  }
  return sale;
}

export function reverseSale(saleId: string): PosSale | null {
  const sale = cache.sales.find((s) => s.id === saleId && !s.reversed);
  if (!sale) return null;

  const previous = { ...cache, sales: [...cache.sales], queue: [...cache.queue] };
  sale.reversed = true;
  for (const line of sale.lines) {
    const p = getPosProducts().find((x) => x.sku === line.sku);
    if (p) p.stock[sale.locationId] = (p.stock[sale.locationId] ?? 0) + line.qty;
  }
  const reversal: JournalEntry = {
    id: `j-rev-${sale.id}`,
    date: new Date().toISOString().slice(0, 10),
    ref: `REV-${sale.ref}`,
    memo: `POS reversal · ${sale.ref}`,
    source: "sales",
    posted: true,
    lines: sale.paymentMethod === "ar"
      ? [
          { account: "4000", debit: sale.subtotal, credit: 0 },
          { account: "1100", debit: 0, credit: sale.total },
        ]
      : [
          { account: "4000", debit: sale.subtotal, credit: 0 },
          { account: "1000", debit: 0, credit: sale.total },
        ],
  };
  journal.unshift(reversal);
  applyPosCache({ ...cache, sales: [...cache.sales] });

  if (isOperationsBackend()) {
    persistInBackground(
      "pos-store",
      async () => {
        const saved = await posBridge.reversePosSaleRemote(saleId);
        if (saved) {
          applyPosCache({
            sales: cache.sales.map((s) => (s.id === saleId ? saved : s)),
            queue: cache.queue,
          });
        }
      },
      () => {
        cache = previous;
      },
      emit,
    );
  }
  emit();
  return sale;
}

export function reprintSale(saleId: string): PosSale | undefined {
  return getSales().find((s) => s.id === saleId);
}

export function resetPosTransactionData(): void {
  cache = { sales: [], queue: [] };
  hydrated = false;
  hydratePromise = null;
  if (isOperationsBackend()) {
    void posBridge.clearPosTransactionsRemote().catch(console.error);
  }
  emit();
}

export async function flushQueue(): Promise<number> {
  const q = getQueue();
  if (q.length === 0) return 0;

  const previous = { sales: [...cache.sales], queue: [...cache.queue] };
  for (const id of q) {
    const sale = cache.sales.find((s) => s.id === id);
    if (!sale) continue;
    sale.status = "synced";
    journal.unshift(...buildJournal(sale));
  }
  applyPosCache({ sales: [...cache.sales], queue: [] });

  if (isOperationsBackend()) {
    try {
      const result = await posBridge.flushPosQueueRemote();
      applyPosCache({
        sales: cache.sales.map((s) => {
          const synced = result.sales.find((x) => x.id === s.id);
          return synced ?? s;
        }),
        queue: [],
      });
      emit();
      return result.count;
    } catch (err) {
      cache = previous;
      emit();
      throw err;
    }
  }
  emit();
  return q.length;
}
