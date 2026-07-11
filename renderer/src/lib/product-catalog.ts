/**
 * Single source of truth for SKU/product data across Inventory, Supply Chain,
 * Purchasing, Manufacturing, and POS.
 *
 * Authoritative store: `inventory-store` (localStorage `benben.inventory.v1`).
 * This module projects inventory rows into forecast/POS shapes and publishes
 * `inventory` ERP events so all subscribers refresh together.
 */

import type { ForecastRow } from "./mock-data";
import { forecast as mockForecast } from "./mock-data";
import { isDemoMode } from "./demo-mode";
import {
  getInventoryItems,
  subscribeInventory,
  type InventoryItem,
} from "./inventory-store";
import { locationIds } from "./location-store";
import type { Product } from "./pos-store";
import { publishErpChange } from "./erp-sync";

/** Re-export — all modules should subscribe via inventory or this helper. */
export function subscribeProductCatalog(fn: () => void): () => void {
  return subscribeInventory(fn);
}

export function getCatalogItems(activeOnly = true): InventoryItem[] {
  const items = getInventoryItems();
  return activeOnly ? items.filter((i) => i.status === "active") : items;
}

export function getCatalogItemBySku(sku: string): InventoryItem | undefined {
  const q = sku.trim().toUpperCase();
  return getInventoryItems().find((i) => i.sku.toUpperCase() === q);
}

/** Build 18-month projected on-hand from current levels (deterministic decay). */
function projectMonthly(onHand: number, safetyStock: number): number[] {
  const months = 18;
  const out: number[] = [];
  let level = onHand;
  const burn = Math.max(1, Math.round((onHand - safetyStock * 0.5) / months));
  for (let i = 0; i < months; i++) {
    out.push(Math.max(0, Math.round(level)));
    level = Math.max(0, level - burn);
  }
  return out;
}

/**
 * Supply-chain forecast rows — always derived from inventory when items exist.
 * Falls back to bundled mock forecast only in demo mode with an empty inventory
 * (first launch before seed hydration).
 */
export function getForecastRows(): ForecastRow[] {
  const items = getCatalogItems();
  if (items.length > 0) {
    return items.map((item) => ({
      sku: item.sku,
      product: item.name,
      onHand: item.onHand,
      safetyStock: item.reorderLevel,
      monthly: projectMonthly(item.onHand, item.reorderLevel),
    }));
  }
  if (isDemoMode()) {
    return mockForecast;
  }
  return [];
}

const POS_PRICE_DEFAULTS: Record<string, { price: number; category: Product["category"] }> = {
  "SF-A7-W": { price: 1850, category: "Wafer" },
  "SF-X3-M": { price: 4200, category: "Module" },
  "SF-Q9-S": { price: 980, category: "Sensor" },
  "SF-K2-S": { price: 320, category: "Sensor" },
  "SF-PCB8": { price: 65, category: "Accessory" },
  "SF-DOP": { price: 142, category: "Accessory" },
  "SF-CAB": { price: 48, category: "Accessory" },
  "SF-CAL": { price: 750, category: "Service" },
  "SF-INST": { price: 220, category: "Service" },
  "SF-WAR": { price: 410, category: "Service" },
  "SF-MNT": { price: 89, category: "Accessory" },
  "SF-OPT": { price: 178, category: "Accessory" },
};

function inferCategory(item: InventoryItem): Product["category"] {
  const def = POS_PRICE_DEFAULTS[item.sku];
  if (def) return def.category;
  const n = item.name.toLowerCase();
  if (n.includes("wafer")) return "Wafer";
  if (n.includes("module")) return "Module";
  if (n.includes("sensor")) return "Sensor";
  if (n.includes("service") || n.includes("install") || n.includes("calibration")) return "Service";
  return "Accessory";
}

/** POS sellable products projected from inventory (+ per-location stock split). */
export function getPosProductsFromCatalog(): Product[] {
  const items = getCatalogItems();
  const ids = locationIds();
  if (items.length === 0 && isDemoMode()) {
    return [];
  }
  return items.map((item) => {
    const def = POS_PRICE_DEFAULTS[item.sku];
    const price = def?.price ?? Math.round(item.unitCost * 1.35);
    const category = def?.category ?? inferCategory(item);
    const stock: Record<string, number> = {};
    for (const id of ids) {
      const isPrimary =
        id === item.warehouse ||
        id === "WH-MAIN" ||
        item.warehouse === "Main" ||
        !item.warehouse;
      stock[id] = isPrimary ? item.onHand : Math.max(0, Math.floor(item.onHand * 0.15));
    }
    return {
      sku: item.sku,
      name: item.name,
      category,
      price,
      barcode: item.barcode,
      qrCode: item.qrCode,
      stock,
    };
  });
}

/** Notify POS and supply chain after external catalog writes. */
export function notifyCatalogChanged(action: string, sku?: string): void {
  publishErpChange("inventory", action, sku);
}
