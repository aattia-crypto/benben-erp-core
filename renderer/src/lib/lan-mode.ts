/** True when the UI is served over HTTP from the host desktop (LAN browser/tablet). */
export function isLanMode(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __BENBEN_LAN_MODE__?: boolean };
  if (w.__BENBEN_LAN_MODE__) return true;
  return !window.benben && window.location.protocol.startsWith("http");
}

export function getLanApiBase(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:3847";
  const w = window as unknown as { __BENBEN_API_BASE__?: string };
  if (w.__BENBEN_API_BASE__) return w.__BENBEN_API_BASE__;
  const host = window.location.hostname || "127.0.0.1";
  return `http://${host}:3847`;
}

/** Desktop shell or LAN browser — both use server-side PostgreSQL auth. */
export function isRemoteAuth(): boolean {
  if (typeof window === "undefined") return false;
  if (window.benben?.auth) return true;
  return isLanMode();
}
