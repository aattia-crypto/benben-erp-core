import { useEffect, useState } from "react";
import { subscribeErp } from "@/lib/erp-sync";
import {
  getCatalogItems,
  getForecastRows,
  getPosProductsFromCatalog,
  subscribeProductCatalog,
} from "@/lib/product-catalog";

/** Reactive catalog — inventory is the single SKU source of truth. */
export function useProductCatalog() {
  const [, tick] = useState(0);

  useEffect(() => {
    const unsubs = [
      subscribeProductCatalog(() => tick((n) => n + 1)),
      subscribeErp((e) => {
        if (e.module === "inventory" || e.module === "pos") tick((n) => n + 1);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  return {
    items: getCatalogItems(),
    forecast: getForecastRows(),
    posProducts: getPosProductsFromCatalog(),
  };
}
