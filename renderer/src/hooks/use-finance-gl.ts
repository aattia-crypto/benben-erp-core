import { useCallback, useEffect, useState } from "react";
import type { Account, JournalEntry } from "@/lib/mock-data";
import {
  fetchAccountsBridge,
  fetchJournalBridge,
  fetchTrialBalanceBridge,
  getLastGlDataSource,
  invalidateFinanceApiCache,
  type GlDataSource,
} from "@/lib/gl-bridge";
import { subscribeGl } from "@/lib/gl-store";
import { useVisibleInterval } from "@/lib/use-visible-interval";

export function useFinanceGl() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [trialRows, setTrialRows] = useState<{ code: string; name: string; debit: number; credit: number }[]>([]);
  const [source, setSource] = useState<GlDataSource>("localStorage");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [acct, jour, tb] = await Promise.all([
        fetchAccountsBridge(),
        fetchJournalBridge(),
        fetchTrialBalanceBridge(),
      ]);
      setAccounts(acct.accounts);
      setJournal(jour.journal);
      setTrialRows(tb.rows);
      setSource(getLastGlDataSource());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load GL data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeGl(() => {
      invalidateFinanceApiCache();
      void refresh();
    });
    return () => unsub();
  }, [refresh]);

  useVisibleInterval(() => {
    invalidateFinanceApiCache();
    void refresh();
  }, 45000);

  return { accounts, journal, trialRows, source, loading, error, refresh };
}

export function useFinanceDashboard() {
  const [data, setData] = useState<import("@/lib/finance-api-types").FinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { financeApi } = await import("@/lib/finance-api-client");
      setData(await financeApi.dashboard());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useVisibleInterval(() => void refresh(), 60000);

  return { data, loading, refresh };
}
