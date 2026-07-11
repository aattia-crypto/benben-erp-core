/**
 * Workspace / installation settings (tax jurisdiction, branding hooks).
 * Distinct from Prisma Settings row — local-first until server sync is wired.
 */

import { readStorage, subscribeStorage, writeStorage } from "./storage";
import { publishErpChange } from "./erp-sync";

export type CompanySettings = {
  defaultTaxState: string;
  taxRateOverride?: number;
  invoiceEmail?: string;
  invoiceFooter?: string;
};

const KEY = "benben.company.settings.v1";

const DEFAULTS: CompanySettings = {
  defaultTaxState: "CA",
  invoiceFooter: "Thank you for your business.",
};

function load(): CompanySettings {
  return { ...DEFAULTS, ...readStorage(KEY, DEFAULTS) };
}

let cache = load();

export function getCompanySettings(): CompanySettings {
  return cache;
}

export function updateCompanySettings(patch: Partial<CompanySettings>): CompanySettings {
  cache = { ...cache, ...patch };
  writeStorage(KEY, cache);
  publishErpChange("pos", "settings-updated");
  return cache;
}

export function subscribeCompanySettings(fn: () => void): () => void {
  return subscribeStorage(KEY, fn);
}
