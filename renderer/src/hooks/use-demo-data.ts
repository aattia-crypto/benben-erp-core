import { useEffect, useState } from "react";
import { isDemoMode, subscribeDemoMode } from "@/lib/demo-mode";

export { isDemoMode, subscribeDemoMode } from "@/lib/demo-mode";
import {
  entities as demoEntities,
  batches as demoBatches,
  accounts as demoAccounts,
  journal as demoJournal,
  kpis as demoKpis,
  type Entity,
  type ProductionBatch,
  type Account,
  type JournalEntry,
  type ForecastRow,
} from "@/lib/mock-data";
import { getForecastRows, getPosProductsFromCatalog } from "@/lib/product-catalog";
import type { Product } from "@/lib/pos-store";

/** Reactive demo flag — alias matches enterprise naming (`isDemoMode`). */
export function useIsDemoMode(): boolean {
  const [on, setOn] = useState<boolean>(() => isDemoMode());
  useEffect(() => {
    setOn(isDemoMode());
    return subscribeDemoMode(() => setOn(isDemoMode()));
  }, []);
  return on;
}

/** @deprecated Prefer useIsDemoMode */
export const useDemoMode = useIsDemoMode;

const emptyKpis: typeof demoKpis = {
  openOrders: 0,
  activeBatches: 0,
  wipValue: 0,
  arBalance: 0,
  apBalance: 0,
  monthRevenue: 0,
  yieldAvg: 0,
  scrapRate: 0,
};

export interface DemoData {
  demo: boolean;
  entities: Entity[];
  batches: ProductionBatch[];
  accounts: Account[];
  journal: JournalEntry[];
  forecast: ForecastRow[];
  kpis: typeof demoKpis;
  products: Product[];
}

export function useDemoData(): DemoData {
  const demo = useIsDemoMode();
  const forecast = getForecastRows();
  const products = getPosProductsFromCatalog();
  if (demo) {
    return {
      demo,
      entities: demoEntities,
      batches: demoBatches,
      accounts: demoAccounts,
      journal: demoJournal,
      forecast,
      kpis: demoKpis,
      products,
    };
  }
  return {
    demo,
    entities: [],
    batches: [],
    accounts: [],
    journal: [],
    forecast,
    kpis: emptyKpis,
    products,
  };
}
