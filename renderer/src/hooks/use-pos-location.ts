import { useEffect, useMemo, useState } from "react";
import {
  getDefaultPosStoreId,
  getStores,
  subscribeLocations,
  type StockLocation,
} from "@/lib/location-store";

/**
 * POS location selector — auto-picks the only store when unambiguous.
 */
export function usePosLocation() {
  const [stores, setStores] = useState<StockLocation[]>(() => getStores());
  const [locationId, setLocationId] = useState<string>(() => getDefaultPosStoreId() ?? "");

  useEffect(() => {
    return subscribeLocations(() => {
      const next = getStores();
      setStores(next);
      const sole = next.length === 1 ? next[0].id : getDefaultPosStoreId();
      setLocationId((prev) => {
        if (prev && next.some((s) => s.id === prev)) return prev;
        return sole ?? "";
      });
    });
  }, []);

  const showSelector = stores.length > 1;
  const singleStore = useMemo(
    () => (stores.length === 1 ? stores[0] : null),
    [stores],
  );

  return {
    stores,
    locationId,
    setLocationId,
    showSelector,
    singleStore,
    ready: stores.length > 0 && !!locationId,
  };
}
