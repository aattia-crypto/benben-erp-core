# Phase 3 — Workflow consistency & catalog sync

## Affected modules

| Area | Change |
|------|--------|
| `product-catalog.ts` | **Single SKU source of truth** → `inventory-store` |
| `supply-chain.tsx` | Reads catalog via `useProductCatalog`; receive calls `adjustStock` |
| `pos.tsx` / `pos-store.ts` | Products from catalog; `usePosLocation` auto-select |
| `location-store.ts` | Onboarding-friendly; demo seeds 1 store + 1 warehouse |
| `/locations` | Store/warehouse CRUD |
| `AppSidebar.tsx` | POS & CRM as **direct links** (no group dropdown) |
| `DemoAdminTools.tsx` | Admin clear / reseed with confirmations |
| `use-demo-data.ts` | Forecast & POS products from catalog |

## Prisma schema

**No migration.** Inventory remains `benben.inventory.v1` until DB promotion.

## Synchronization strategy

```
inventory-store (authoritative)
       ↓
product-catalog.ts (projections)
       ↓
├── getForecastRows() → Supply Chain, Dashboard
├── getPosProductsFromCatalog() → POS
└── publishErpChange('inventory') → subscribeErp / subscribeInventory
```

Purchasing receive and manufacturing consumption already call `adjustStock`, which publishes inventory events.

## Reusable components

- `DemoAdminTools` — system demo reset panel
- `useProductCatalog` — reactive SKU list
- `usePosLocation` — single-store auto-select

## Migration impact

- Existing `benben.locations.v1` keys with old `S1`…`S6` IDs remain valid until admin reconfigures or demo reseed.
- Clearing demo data wipes locations; demo reseed creates `STORE-MAIN` + `WH-MAIN`.
