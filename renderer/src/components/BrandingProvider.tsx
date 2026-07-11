import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { BrandingDto } from "@/lib/branding-types";
import { DEFAULT_ACCENT_COLOR } from "@/lib/branding-types";
import { applyAccentColor, loadBranding } from "@/lib/branding-bridge";

type BrandingContextValue = {
  branding: BrandingDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BrandingContext = createContext<BrandingContextValue>({
  branding: null,
  loading: true,
  refresh: async () => {},
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const dto = await loadBranding();
    setBranding(dto);
    applyAccentColor(dto.accentColor || DEFAULT_ACCENT_COLOR);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const dto = await loadBranding();
        if (!cancelled) {
          setBranding(dto);
          applyAccentColor(dto.accentColor || DEFAULT_ACCENT_COLOR);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ branding, loading, refresh }),
    [branding, loading, refresh],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
