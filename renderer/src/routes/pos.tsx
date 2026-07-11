import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Minus,
  Plus,
  Search,
  Trash2,
  ShoppingCart,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  CloudUpload,
} from "lucide-react";
import { PageHeader, Pill, fmtMoney, erp } from "@/components/ui-bits";
import { ExportToolbar } from "@/components/ExportToolbar";
import { toast } from "sonner";
import { getTaxRateForLocation, calcTax } from "@/lib/pos-tax";
import { getLoyaltyAccounts, redeemPoints, subscribeLoyalty } from "@/lib/pos-loyalty";
import { getEntities, subscribeCrm } from "@/lib/crm-store";
import {
  reverseSale,
  voidSale,
  reprintSale,
} from "@/lib/pos-store";
import { getOnlineOrders, subscribePosOps, updateOnlineOrderStatus } from "@/lib/pos-ops-store";
import { useCompanyName } from "@/hooks/use-workspace";
import {
  findProductByScan,
  checkout,
  flushQueue,
  getSales,
  getQueue,
  subscribe,
  type CartLine,
  type LocationId,
  type PosSale,
} from "@/lib/pos-store";
import { ScanInput } from "@/components/ScanInput";
import { useProductCatalog } from "@/hooks/use-product-catalog";
import { usePosLocation } from "@/hooks/use-pos-location";
import { subscribeErp } from "@/lib/erp-sync";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale — Benben ERP" },
      { name: "description", content: "Touch-optimized POS with offline-first sync to the General Ledger." },
    ],
  }),
  component: POS,
});

const categories = ["All", "Wafer", "Module", "Sensor", "Accessory", "Service"] as const;

type PosCustomerOption = {
  code: string;
  name: string;
  tier?: string;
  points?: number;
};

function posCustomerOptions(): PosCustomerOption[] {
  const entities = getEntities().filter((e) => e.kind === "client" || e.kind === "both");
  const loyalty = getLoyaltyAccounts();
  const byCode = new Map<string, PosCustomerOption>();
  for (const e of entities) {
    const acct = loyalty.find((a) => a.customerCode === e.code);
    byCode.set(e.code, {
      code: e.code,
      name: e.name,
      tier: acct?.tier,
      points: acct?.points,
    });
  }
  for (const a of loyalty) {
    if (!byCode.has(a.customerCode)) {
      byCode.set(a.customerCode, {
        code: a.customerCode,
        name: a.name,
        tier: a.tier,
        points: a.points,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function POS() {
  const companyName = useCompanyName();
  const { posProducts: products } = useProductCatalog();
  const { locationId, setLocationId, showSelector, singleStore, stores, ready } = usePosLocation();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof categories)[number]>("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"cash" | "ar" | "card">("cash");
  const [taxExempt, setTaxExempt] = useState(false);
  const [customerCode, setCustomerCode] = useState("");
  const [online, setOnline] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [, setTick] = useState(0);
  const [lastSale, setLastSale] = useState<PosSale | null>(null);
  const customers = posCustomerOptions();
  const selectedCustomer = customers.find((c) => c.code === customerCode);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const unsub = subscribe(() => setTick((t) => t + 1));
    const unsubOps = subscribePosOps(() => setTick((t) => t + 1));
    const unsubErp = subscribeErp(() => setTick((t) => t + 1));
    const unsubCrm = subscribeCrm(() => setTick((t) => t + 1));
    const unsubLoyalty = subscribeLoyalty(() => setTick((t) => t + 1));
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      unsub();
      unsubOps();
      unsubErp();
      unsubCrm();
      unsubLoyalty();
    };
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (cat !== "All" && p.category !== cat) return false;
      if (query && !`${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, cat, products]);

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = calcTax(subtotal, locationId, taxExempt);
  const total = subtotal + tax;
  const taxInfo = getTaxRateForLocation(locationId);

  function addToCart(sku: string) {
    const p = products.find((x) => x.sku === sku || x.sku === sku.trim());
    if (!p) return;
    setCart((prev) => {
      const i = prev.findIndex((l) => l.sku === sku);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: copy[i].qty + 1 };
        return copy;
      }
      return [...prev, { sku: p.sku, name: p.name, price: p.price, qty: 1 }];
    });
  }
  function setQty(sku: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.sku === sku ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  }
  function removeLine(sku: string) {
    setCart((prev) => prev.filter((l) => l.sku !== sku));
  }

  async function handleCheckout() {
    if (!ready) {
      toast.error("Configure at least one store under Settings → Locations.");
      return;
    }
    if (cart.length === 0) return;
    if (!customerCode || !selectedCustomer) {
      toast.error("Select a customer from CRM or loyalty before checkout.");
      return;
    }
    if (payment === "ar" && customers.length === 0) {
      toast.error("A/R checkout requires an active CRM customer profile.");
      return;
    }
    setCheckingOut(true);
    try {
      const sale = await checkout({
        locationId,
        paymentMethod: payment,
        lines: cart,
        online,
        taxExempt,
        customer: { code: selectedCustomer.code, name: selectedCustomer.name },
      });
      setLastSale(sale);
      setCart([]);
      setCustomerCode("");
      toast.success(`Sale ${sale.ref} complete`);
      setTimeout(() => setLastSale(null), 4000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed — sale not saved.");
    } finally {
      setCheckingOut(false);
    }
  }

  function handleScan(code: string) {
    const p = findProductByScan(code) ?? products.find((x) => x.name.toLowerCase().includes(code.toLowerCase()));
    if (p) {
      addToCart(p.sku);
      toast.success(`Added ${p.sku}`);
    } else toast.error("SKU / barcode not found.");
  }

  function handleScanSearch() {
    if (!query.trim()) return;
    handleScan(query);
    setQuery("");
  }

  const sales = getSales();
  const queueLen = getQueue().length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Point of Sale"
        subtitle="Touch-optimized retail terminal · auto-posts to General Ledger on checkout."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportToolbar
              filenameBase="pos-sales"
              columns={[
                { key: "ref", label: "Ref" },
                { key: "date", label: "Date" },
                { key: "paymentMethod", label: "Payment" },
                { key: "total", label: "Total", align: "right", format: (v) => fmtMoney(Number(v)) },
              ]}
              rows={getSales().map((s) => ({
                ref: s.ref,
                date: s.date,
                paymentMethod: s.paymentMethod,
                total: s.total,
              }))}
              meta={{ title: "POS Sales", filters: `Location ${locationId}` }}
            />
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
              {online ? (
                <Wifi className="h-3.5 w-3.5 text-success" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-warning" />
              )}
              <span className="text-muted-foreground">{online ? "Online" : "Offline"}</span>
              {queueLen > 0 && (
                <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-[oklch(0.45_0.12_75)]">
                  {queueLen} queued
                </span>
              )}
            </div>
            <button
              onClick={() => setOnline((o) => !o)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-surface"
              title="Simulate connectivity"
            >
              Toggle network
            </button>
            {queueLen > 0 && online && (
              <button
                onClick={() => {
                  void flushQueue()
                    .then((n) => {
                      if (n > 0) toast.success(`Synced ${n} queued sale${n === 1 ? "" : "s"}.`);
                    })
                    .catch((err) =>
                      toast.error(err instanceof Error ? err.message : "Queue sync failed."),
                    );
                }}
                className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand/90"
              >
                <CloudUpload className="h-3.5 w-3.5" />
                Sync {queueLen}
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Product side */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {stores.length === 0 ? (
              <Link to="/locations" className="text-sm text-brand hover:underline">
                Set up your first store →
              </Link>
            ) : showSelector ? (
              <div className="relative">
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value as LocationId)}
                  className="h-10 appearance-none rounded-md border border-border bg-card pl-3 pr-9 text-sm font-medium outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                >
                  {stores.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            ) : singleStore ? (
              <Pill tone="neutral">{singleStore.label}</Pill>
            ) : null}

            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScanSearch()}
                placeholder="Search by name…"
                className="h-10 w-full rounded-md border border-border bg-card pl-8 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    cat === c
                      ? "bg-slate-ink text-slate-ink-fg"
                      : "text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <ScanInput
            className="max-w-xl"
            placeholder="USB barcode / QR — scan to add to cart"
            onScan={handleScan}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const stock = p.stock[locationId] ?? 0;
              const out = stock === 0;
              return (
                <button
                  key={p.sku}
                  disabled={out}
                  onClick={() => addToCart(p.sku)}
                  className="group flex h-32 flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.sku}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
                      {p.name}
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-base font-semibold tabular-nums">{fmtMoney(p.price)}</span>
                    <span
                      className={`text-[10px] font-medium ${
                        out ? "text-danger" : stock < 20 ? "text-warning" : "text-muted-foreground"
                      }`}
                    >
                      {out ? "OUT" : `${stock} on hand`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart */}
        <aside className="sticky top-20 flex h-[calc(100vh-7rem)] flex-col rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-surface px-4 py-2 text-center">
            <div className="text-sm font-semibold tracking-tight">{companyName}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sales Receipt · Location {locationId}</div>
          </div>
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-semibold">Cart</h2>
              <Pill tone="neutral">{cart.length} items</Pill>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-[11px] text-muted-foreground hover:text-danger"
              >
                Clear
              </button>
            )}
          </header>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">Tap a product to add it</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l) => (
                  <li key={l.sku} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {l.sku}
                        </div>
                        <div className="truncate text-sm font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {fmtMoney(l.price)} ea
                        </div>
                      </div>
                      <button
                        onClick={() => removeLine(l.sku)}
                        className="text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-md border border-border">
                        <button
                          onClick={() => setQty(l.sku, -1)}
                          className="grid h-7 w-7 place-items-center hover:bg-surface"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">{l.qty}</span>
                        <button
                          onClick={() => setQty(l.sku, 1)}
                          className="grid h-7 w-7 place-items-center hover:bg-surface"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {fmtMoney(l.price * l.qty)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="border-t border-border p-4">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{fmtMoney(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Tax ({taxExempt ? "exempt" : `${(taxInfo.rate * 100).toFixed(2)}% ${taxInfo.state}`})</dt>
                <dd className="tabular-nums">{fmtMoney(tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{fmtMoney(total)}</dd>
              </div>
            </dl>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-1">
              {(["cash", "card", "ar"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayment(m)}
                  className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                    payment === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "cash" ? "Cash" : m === "card" ? "Card" : "A/R"}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} />
              Tax-exempt transaction
            </label>
            <label className="mt-2 block text-xs">
              <span className="mb-1 block text-muted-foreground">Customer (CRM / loyalty)</span>
              <select
                className={erp.input}
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                    {c.tier ? ` · ${c.tier}` : ""}
                  </option>
                ))}
              </select>
              {customers.length === 0 ? (
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  Add CRM clients or loyalty accounts before checkout.
                </span>
              ) : selectedCustomer?.points !== undefined ? (
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  {selectedCustomer.points} loyalty points · earns {Math.floor(total / 10)} on this sale
                </span>
              ) : null}
            </label>

            <button
              onClick={() => void handleCheckout()}
              disabled={cart.length === 0 || checkingOut || !customerCode}
              className="mt-3 h-12 w-full rounded-md bg-brand text-base font-semibold text-brand-foreground transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {checkingOut ? "Saving…" : `Checkout · ${fmtMoney(total)}`}
            </button>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Auto-posts: Dr {payment === "cash" ? "1000 Cash" : "1100 A/R"} · Cr 4000 Sales
            </p>
          </footer>
        </aside>
      </div>

      {/* Recent sales strip */}
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Transactions</h2>
          <span className="text-[11px] text-muted-foreground">
            Stored locally · {sales.length} total
          </span>
        </header>
        {sales.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 font-medium">Items</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Sync</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 8).map((s) => (
                <tr key={s.id} className={`border-t border-border ${s.reversed ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2 font-mono text-xs">{s.ref}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(s.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2">{s.locationId}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {s.customerName ?? s.customerCode ?? "—"}
                  </td>
                  <td className="px-4 py-2 uppercase text-xs text-muted-foreground">{s.paymentMethod}</td>
                  <td className="px-4 py-2 tabular-nums">{s.lines.reduce((n, l) => n + l.qty, 0)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{fmtMoney(s.total)}</td>
                  <td className="px-4 py-2">
                    {s.status === "synced" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Posted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <Clock className="h-3.5 w-3.5" /> Queued
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {!s.reversed && (
                      <button
                        type="button"
                        className="text-brand hover:underline"
                        onClick={() => {
                          const reason = window.prompt("Void reason (manager review):", "Customer request");
                          if (!reason) return;
                          const pin = window.prompt("Manager PIN (optional):", "");
                          voidSale(s.id, reason, pin || undefined);
                          toast.success("Transaction voided and logged.");
                        }}
                      >
                        Void
                      </button>
                    )}
                    <button
                      type="button"
                      className="ml-2 text-muted-foreground hover:underline"
                      onClick={() => {
                        const r = reprintSale(s.id);
                        if (r) toast.message(`Reprint ${r.ref} · ${fmtMoney(r.total)}`);
                      }}
                    >
                      Reprint
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Online order queue</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {getOnlineOrders().map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2">
              <span>
                {o.orderNumber} · {o.customerName} · {fmtMoney(o.total)} · {o.fulfillment}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-brand"
                  onClick={() => {
                    updateOnlineOrderStatus(o.id, "ready");
                    toast.success("Marked ready for pickup.");
                  }}
                >
                  Ready
                </button>
                <button
                  type="button"
                  className="text-xs text-brand"
                  onClick={() => {
                    for (const line of o.lines) addToCart(line.sku);
                    updateOnlineOrderStatus(o.id, "picked_up");
                    toast.success("Loaded into cart.");
                  }}
                >
                  Load cart
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Loyalty & rewards</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {getLoyaltyAccounts().map((a) => (
            <div key={a.id} className="rounded-md border border-border bg-surface p-3 text-xs">
              <div className="font-medium">{a.name}</div>
              <div className="text-muted-foreground">{a.customerCode}</div>
              <div className={`mt-1 ${erp.financial}`}>{a.points} pts · {a.tier}</div>
              <button
                type="button"
                className="mt-1 text-brand hover:underline"
                onClick={() => {
                  if (redeemPoints(a.customerCode, 100, "POS redeem")) toast.success("Redeemed 100 points.");
                  else toast.error("Insufficient points.");
                }}
              >
                Redeem 100
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Toast */}
      {lastSale && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <div
            className={`grid h-8 w-8 place-items-center rounded-full ${
              lastSale.status === "synced" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
            }`}
          >
            {lastSale.status === "synced" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {lastSale.ref} · {fmtMoney(lastSale.total)}
            </div>
            <div className="text-xs text-muted-foreground">
              {lastSale.status === "synced"
                ? "Posted to General Ledger"
                : "Queued locally — will sync when online"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
