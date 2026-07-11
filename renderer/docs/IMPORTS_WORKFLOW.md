# Imports module — business logic audit

## Implemented workflow

1. **Shipment tracking** — Each import has a reference, origin/destination, status (`booked` → `in_transit` → `customs` → `delivered`), and ETA.
2. **Line-level FOB** — `ImportLine` records SKU, qty, and FOB `unitValue` before duties.
3. **Customs / tariff** — `customsTariffPct` is an **ad-valorem** rate applied to total FOB merchandise (not per-line in v1).
4. **Flat fees** — `customsFees`, `freightCost`, and `insuranceCost` are additive lump sums.
5. **Landed cost** — Computed automatically on save:

   ```
   landed = FOB + (FOB × tariff%) + customsFees + freight + insurance
   ```

6. **Documentation** — Attachments store filename/size/timestamp (desktop path or browser file name).
7. **Inventory costing** — **Apply landed cost** allocates the shipment total to SKUs **by FOB value share**, then updates weighted average `unitCost` in inventory (see `applyLandedCostToInventory`).

## Mathematical verification

| Example (demo seed IMP-2026-018) | Value |
|----------------------------------|-------|
| FOB line 1 | 200 × 410 = 82,000 |
| FOB line 2 | 40 × 880 = 35,200 |
| **FOB total** | **117,200** |
| Duty 4.5% | 5,274 |
| Customs + freight + insurance | 2,400 + 8,200 + 1,100 = 11,700 |
| **Landed total** | **134,174** |

Previously the UI stored a static `landedCost: 128_400` with **no line breakdown** — that figure could not be reconciled. The store now derives landed cost from components.

## Gaps and recommendations (non-breaking)

| Gap | Recommendation |
|-----|----------------|
| No automatic GL accrual for duty/freight | Post journal on “Apply landed cost” (Dr Inventory, Cr GRNI / Accrued imports). |
| Tariff is shipment-level % only | Add HS code / per-line duty rates for mixed HTS shipments. |
| Receiving not tied to PO | Link import lines to purchase orders and three-way match. |
| Attachments are metadata only | Persist file blobs via Electron `dialog` + app data dir. |
| No FX conversion | Add `currency` + `exchangeRate` on shipment for non-USD FOB. |

## Placeholder vs production

- **Production-ready in desktop demo:** formula, allocation, inventory unit cost update, audit trail movement.
- **Clearly demo/local:** attachment bytes not stored; no customs broker API; statuses are manual buttons.
