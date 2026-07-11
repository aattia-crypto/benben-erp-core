/**
 * Locale-aware formatting — org base currency remains authoritative for money values.
 */

import { getOrgProfile } from "./org-profile";
import { getLocaleSettings } from "./locale-settings";

export function getActiveLocale(): string {
  return getLocaleSettings().locale;
}

export function formatMoneyLocale(amount: number, currency?: string): string {
  const cur = currency ?? getOrgProfile().baseCurrency ?? "USD";
  const locale = getActiveLocale();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  }
}

export function formatNumberLocale(n: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getActiveLocale(), options).format(n);
}

export function formatDateLocale(iso: string | Date, style: "short" | "medium" | "long" = "medium"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const locale = getActiveLocale();
  const map: Record<string, Intl.DateTimeFormatOptions> = {
    short: { dateStyle: "short" },
    medium: { dateStyle: "medium" },
    long: { dateStyle: "full" },
  };
  return new Intl.DateTimeFormat(locale, map[style]).format(d);
}

export function formatDateTimeLocale(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(getActiveLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Validate string is safe Unicode for PDF/email (no control chars except tab/newline). */
export function isUnicodeSafeText(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 && ch !== "\n" && ch !== "\r" && ch !== "\t") return false;
  }
  return true;
}

export function sanitizeUnicodeText(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}
