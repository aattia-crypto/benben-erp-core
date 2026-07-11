import { useCallback, useEffect, useState } from "react";
import type { ArInvoice } from "@/lib/ar-store";
import {
  fetchArInvoicesBridge,
  getArAgingBridge,
  getArDashboardBridge,
  invalidateArApiCache,
} from "@/lib/ar-bridge";
import { subscribeAr } from "@/lib/ar-store";
import { subscribeErp } from "@/lib/erp-sync";
import { useVisibleInterval } from "@/lib/use-visible-interval";

export function useFinanceAr() {
  const [invoices, setInvoices] = useState<ArInvoice[]>([]);
  const [dash, setDash] = useState({
    openBalance: 0,
    overdueBalance: 0,
    unappliedPayments: 0,
    openCount: 0,
  });
  const [aging, setAging] = useState<Record<string, number>>({
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    d90plus: 0,
  });
  const [source, setSource] = useState("localStorage");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, d, a] = await Promise.all([
        fetchArInvoicesBridge(),
        getArDashboardBridge(),
        getArAgingBridge(),
      ]);
      setInvoices(inv.invoices);
      setSource(inv.source);
      setDash({
        openBalance: d.openBalance,
        overdueBalance: d.overdueBalance,
        unappliedPayments: d.unappliedPayments,
        openCount: d.openCount,
      });
      const { source: _s, ...buckets } = a as Record<string, number | string>;
      setAging(buckets as typeof aging);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubs = [
      subscribeAr(() => {
        invalidateArApiCache();
        void refresh();
      }),
      subscribeErp(() => {
        invalidateArApiCache();
        void refresh();
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [refresh]);

  useVisibleInterval(() => {
    invalidateArApiCache();
    void refresh();
  }, 45000);

  return { invoices, dash, aging, source, loading, refresh };
}
