# Stabilization & Polish — Completion Report

**Date:** 2026-05-24  
**Build:** `npm run build` ✅

---

## Phase 1 — Finance completion

| Feature | Status |
|---------|--------|
| AR credit memo (GL reversal Dr 4000 / Cr 1100) | ✅ `createArCreditMemo` in `ar.service.ts` |
| AP vendor credit (GL Dr 2000 / Cr 5000) | ✅ `createApVendorCredit` in `ap.service.ts` |
| Invoice → journal drilldown | ✅ `ArInvoiceDetailPanel` + `GET /api/finance/ar/invoices/{id}` |
| Bill → journal drilldown | ✅ `ApBillDetailPanel` + `GET /api/finance/ap/bills/{id}` |
| Payment allocation transparency | ✅ Detail panels show allocations, progress bar, credit memos |
| AR/AP UI credit memo forms | ✅ `/ar`, `/ap` with amount + reason |

**Schema changes:** None (uses existing `ArCreditMemo`, `ApVendorCredit`).

---

## Phase 2 — CRM timeline refinement

| Item | Status |
|------|--------|
| `buildCustomerTimelineBridge()` | ✅ Loads AR ledger from Finance API when available |
| Normalized event titles | ✅ Invoice created, Payment received, Credit memo, Task, Opportunity updated |
| Customer 360 | ✅ Async unified chronological timeline |

---

## Phase 3 — Activity log viewer

| Item | Status |
|------|--------|
| Route `/activity-log` | ✅ Read-only table |
| Filters | ✅ module, entity type, action, date range |
| Backend | ✅ `listSystemLogs()` merges `ActivityLog` + `AuditLog` |
| Sidebar | ✅ Support → Activity Log |

---

## Phase 4 — Help / guidance

| Guide | Status |
|-------|--------|
| Finance modules (GL, bank, assets, budget, FX) | ✅ Help tab **Finance Modules** |
| AR/AP (lifecycle, payments, credits, aging) | ✅ Help tab **AR & AP** |
| CRM (pipeline, 360, automation) | ✅ Help tab **CRM & Pipeline** |

---

## Phase 5 — UI clarity

| Item | Status |
|------|--------|
| `DataSourceBadge` component | ✅ GL, AR, AP, Finance Workspace |
| `SystemHealthPanel` refresh | ✅ Manual refresh + clearer Finance DB / API labels |

---

## New / modified endpoints

| Method | Path |
|--------|------|
| POST | `/api/finance/ar/credit-memos` |
| GET | `/api/finance/ar/invoices/{invoiceId}` |
| POST | `/api/finance/ap/vendor-credits` |
| GET | `/api/finance/ap/bills/{billId}` |
| GET | `/api/finance/activity` (extended filters → `combined` array) |

---

## New UI screens / components

- `/activity-log` — System Activity Log
- `ArInvoiceDetailPanel.tsx`, `ApBillDetailPanel.tsx`
- `DataSourceBadge.tsx`
- `components/help/FinanceHelpGuides.tsx`

---

## Preserved (unchanged)

- `gl-store.ts`, `ar-store.ts`, `ap-store.ts` fallbacks
- Packaging / installer pipeline
- Prisma schema (no migration required)

---

## Remaining technical debt

1. **GL drill-down from detail panel** — Link goes to GL page; deep-link to specific journal ref not yet implemented.
2. **AuditLog module filter** — Audit rows map to `system` module only; finer CRM/finance split on audit table would need more `logAuditEvent` call sites.
3. **Local demo credit memos** — Fallback stores do not post GL when API is offline.
4. **Activity log user display** — Shows `userId` slice only; no join to `User.displayName` yet.

---

## Validation

- [x] `npm run build` passes
- [ ] `npm run start:prod` — run locally after pull
- [ ] AR/AP persist after restart — verify in desktop shell
- [ ] Installer unchanged — no LICENSE or NSIS edits in this phase
