export function friendlyFinanceApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("Failed to fetch") || raw.includes("NetworkError")) {
    return "Cannot reach the Finance API. Restart Benben or check that the local service is running.";
  }
  if (raw.includes("401") || raw.toLowerCase().includes("unauthorized")) {
    return "Your session may have expired. Sign in again.";
  }
  if (raw.includes("503") || raw.toLowerCase().includes("unavailable")) {
    return "Finance service is temporarily unavailable. Try again in a moment.";
  }
  if (raw.toLowerCase().includes("sqlite") || raw.toLowerCase().includes("database")) {
    return "A database error occurred. Check Settings → System health and consider restoring from backup.";
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
