import { useEffect } from "react";

/** Runs callback on interval only while the browser tab/window is visible. */
export function useVisibleInterval(callback: () => void, ms: number, enabled = true): void {
  useEffect(() => {
    if (!enabled || ms <= 0) return;
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id) return;
      id = setInterval(callback, ms);
    };
    const stop = () => {
      if (id) {
        clearInterval(id);
        id = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [callback, ms, enabled]);
}
