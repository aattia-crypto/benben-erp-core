/**
 * Wipes module stores when the user leaves demo mode.
 * Called from clearDemoData() after isDemoMode is set to false.
 */
import { journal } from "./mock-data";
import { resetManufacturingStore } from "./manufacturing-store";
import { resetInventoryStore } from "./inventory-store";
import { resetCrmStore } from "./crm-store";
import { resetGlStore } from "./gl-store";
import { resetPurchasingStore } from "./purchasing-store";
import { resetImportsStore } from "./imports-store";
import { resetArStore } from "./ar-store";
import { resetApStore } from "./ap-store";
import { resetSalesStore } from "./sales-store";
import { resetLocationStore } from "./location-store";
import { resetLoyaltyStore } from "./pos-loyalty";
import { resetBlindSpotStore } from "./blind-spot-store";
import { resetPosTransactionData } from "./pos-store";
import { DEMO_MODULE_STORAGE_KEYS } from "./demo-keys";

export { DEMO_MODULE_STORAGE_KEYS };

/** Clears persisted ERP sample data and in-memory module caches. */
export function wipeSandboxData(): void {
  if (typeof window !== "undefined") {
    for (const key of DEMO_MODULE_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  }

  journal.length = 0;

  resetManufacturingStore();
  resetInventoryStore();
  resetCrmStore();
  resetGlStore();
  resetPurchasingStore();
  resetImportsStore();
  resetArStore();
  resetApStore();
  resetSalesStore();
  resetLocationStore();
  resetLoyaltyStore();
  resetBlindSpotStore();
  resetPosTransactionData();
}
