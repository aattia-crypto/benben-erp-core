import { useCallback, useEffect, useState } from "react";
import type { ApBill } from "@/lib/ap-store";
import {
  fetchApBillsBridge,
  getApAgingBridge,
  getApDashboardBridge,
  invalidateApApiCache,
} from "@/lib/ap-bridge";
import { getRecurringBills, subscribeAp } from "@/lib/ap-store";
import { subscribeErp } from "@/lib/erp-sync";
import { useVisibleInterval } from "@/lib/use-visible-interval";

export function useFinanceAp() {
  const [bills, setBills] = useState<ApBill[]>([]);
  const [dash, setDash] = useState({
    openBalance: 0,
    dueThisWeek: 0,
    overdue: 0,
    scheduledPayments: 0,
  });
  const [aging, setAging] = useState<Record<string, number>>({});
  const [source, setSource] = useState("localStorage");
  const [loading, setLoading] = useState(true);
  const recurring = getRecurringBills();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [b, d, a] = await Promise.all([
        fetchApBillsBridge(),
        getApDashboardBridge(),
        getApAgingBridge(),
      ]);
      setBills(b.bills);
      setSource(b.source);
      setDash({
        openBalance: d.openBalance,
        dueThisWeek: d.dueThisWeek,
        overdue: d.overdue,
        scheduledPayments: d.scheduledPayments,
      });
      const { source: _s, ...buckets } = a as Record<string, number | string>;
      setAging(buckets as Record<string, number>);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubs = [
      subscribeAp(() => {
        invalidateApApiCache();
        void refresh();
      }),
      subscribeErp(() => {
        invalidateApApiCache();
        void refresh();
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [refresh]);

  useVisibleInterval(() => {
    invalidateApApiCache();
    void refresh();
  }, 45000);

  return { bills, dash, aging, recurring, source, loading, refresh };
}
