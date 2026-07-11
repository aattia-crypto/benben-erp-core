/** State sales tax rates by store location (installation-aware). */

const STATE_TAX: Record<string, number> = {
  CA: 0.0875,
  TX: 0.0825,
  MA: 0.0625,
  WA: 0.1015,
  AZ: 0.084,
  GA: 0.08,
};

import { getLocationById } from "./location-store";
import { getCompanySettings } from "./company-settings";

export function getTaxRateForLocation(locationId: string): { state: string; rate: number } {
  const settings = getCompanySettings();
  if (settings.taxRateOverride !== undefined) {
    return { state: settings.defaultTaxState, rate: settings.taxRateOverride };
  }
  const loc = getLocationById(locationId);
  const state = loc?.taxState ?? settings.defaultTaxState ?? "CA";
  return { state, rate: STATE_TAX[state] ?? 0.0875 };
}

export function calcTax(subtotal: number, locationId: string, taxExempt: boolean): number {
  if (taxExempt || subtotal <= 0) return 0;
  const { rate } = getTaxRateForLocation(locationId);
  return Math.round(subtotal * rate * 100) / 100;
}
