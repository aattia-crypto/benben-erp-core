import { useEffect, useMemo, useState } from "react";
import {
  queryBlindSpots,
  subscribeBlindSpotStore,
  type BlindSpotEntry,
  type BlindSpotQuery,
} from "@/lib/blind-spot-store";

export type BlindSpotAlertContext = {
  entityId?: string;
  customerCode?: string;
  sku?: string;
  skus?: string[];
};

/** Load high-visibility tribal knowledge warnings for the active form context. */
export function useBlindSpotAlerts(context: BlindSpotAlertContext) {
  const [alerts, setAlerts] = useState<BlindSpotEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [, tick] = useState(0);

  const query = useMemo<BlindSpotQuery>(
    () => ({
      entityId: context.entityId,
      customerCode: context.customerCode,
      sku: context.sku,
      skus: context.skus?.filter((s) => s.trim()),
    }),
    [context.entityId, context.customerCode, context.sku, context.skus?.join("|")],
  );

  const hasContext = !!(
    query.entityId?.trim() ||
    query.customerCode?.trim() ||
    query.sku?.trim() ||
    (query.skus?.length ?? 0) > 0
  );

  useEffect(() => subscribeBlindSpotStore(() => tick((n) => n + 1)), []);

  useEffect(() => {
    if (!hasContext) {
      setAlerts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void queryBlindSpots(query)
      .then((rows) => {
        if (cancelled) return;
        const high = rows.filter((r) => r.severity === "high");
        const deduped = [...new Map(high.map((r) => [r.id, r])).values()];
        setAlerts(deduped);
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasContext, query.entityId, query.customerCode, query.sku, query.skus?.join("|")]);

  return { alerts, loading, hasContext };
}
