# Phase 2 — Core ERP Expansion (architecture)

## Affected modules

| Area | Files / routes |
|------|----------------|
| Sync bus | `lib/erp-sync.ts`, `lib/erp-integrations.ts` |
| AR | `lib/ar-store.ts`, `/ar` |
| AP | `lib/ap-store.ts`, `/ap` |
| Sales invoicing | `lib/sales-store.ts`, `/sales-invoicing` |
| Company tax settings | `lib/company-settings.ts` |
| POS ops | `lib/pos-ops-store.ts`, `lib/pos-store.ts`, `/pos` |
| Integrations | purchasing receive → AP; POS AR → AR/GL/CRM; sales fulfill → inventory/AR/GL/CRM |
| UI | `ExportMenu.tsx`, `AppSidebar.tsx`, dashboard `/` |
| Demo | `demo-keys.ts`, `demo-data-reset.ts`, store seeds |

**Unchanged:** Electron `main.ts`, hash routing, `stage-renderer.mjs`, Prisma auth schema, packaging.

## Schema changes (Prisma)

**None in this phase.** Finance modules use versioned `localStorage` keys:

- `benben.ar.v1`
- `benben.ap.v1`
- `benben.sales.v1`
- `benben.company.settings.v1`
- `benben.pos.ops.v1`

### Future Prisma migration (when promoting to DB)

Suggested tables: `ArInvoice`, `ArPayment`, `ApBill`, `ApPayment`, `SalesQuote`, `SalesOrder`, `SalesInvoice`, `PosOnlineOrder`, `PosReturn`, `VoidAudit`. Wire IPC writes + `publishErpChange` after commit.

## Event / state synchronization strategy

1. **Module stores** call `publishErpChange(module, action)` after `writeStorage`.
2. **`subscribeErp` / `subscribeErpModule`** — dashboards and cross-module UIs re-render instantly.
3. **`erp-integrations.ts`** — orchestrates multi-module flows (single entry point for GL + AR + AP + inventory + CRM).
4. **POS ↔ inventory** — checkout calls `adjustStock`; inventory changes emit `inventory` events; POS listens and refreshes `WH-MAIN` stock.
5. **Avoid circular imports** — use dynamic `import()` at integration boundaries (POS checkout → AR, manufacturing → inventory).

## Reusable components

| Component | Purpose |
|-----------|---------|
| `ErpFormDialog` | Modal create/edit (existing) |
| `LineItemsEditor` | Shared line grids (existing) |
| `ExportMenu` | Single Export dropdown (PDF / Excel / CSV) |
| `ExportToolbar` | Thin wrapper → `ExportMenu` |

## Migration impact

- **Existing users:** New keys auto-seed in demo mode; production mode starts empty AR/AP/sales until data entry.
- **Clear demo:** `demo-keys.ts` includes new keys; wipe resets AR/AP/sales/pos-ops.
- **No DB migration required** to run the desktop app.

## Integration flows (implemented)

```
POS checkout (AR) → integratePosArSale → AR invoice + GL + CRM note
POS checkout (all) → inventory adjustStock (issue)
PO receive → adjustStock + integratePoToApBill → AP bill + GL
Sales invoice Fulfill → integrateSalesInvoiceFulfillment → inventory + AR + GL + CRM
Manufacturing material usage → inventory issue
Imports landed cost → inventory weighted cost (existing)
```
