# Finance API (local)

The Electron main process exposes a **localhost-only** REST API for the five financial subsystems. Default base URL:

`http://127.0.0.1:3847`

Override with `BENBEN_FINANCE_API_HOST` / `BENBEN_FINANCE_API_PORT`.

## Health

`GET /api/finance/health`

## Bank reconciliation

| Method | Path | Body |
|--------|------|------|
| POST | `/api/finance/bank-statements/upload` | `bankAccountCode`, `statementDate`, balances, `transactions[]` |
| POST | `/api/finance/reconcile/match-auto` | `bankStatementId`, optional `dateToleranceDays` (default 3) |
| POST | `/api/finance/reconcile/match-manual` | `bankTransactionId`, `journalLineIds[]` |

Match status flow: `UNMATCHED` → `PARTIALLY_MATCHED` → `MATCHED` → `RECONCILED`.

## Fixed assets

| Method | Path |
|--------|------|
| POST | `/api/finance/assets` |
| GET | `/api/finance/assets/{id}/depreciation-schedule` |
| POST | `/api/finance/assets/depreciate-run` |

Depreciation methods: `STRAIGHT_LINE`, `DOUBLE_DECLINING`. Monthly run posts balanced GL entries (expense → accumulated depreciation).

## Budgeting

| Method | Path |
|--------|------|
| POST | `/api/finance/budgets` |
| GET | `/api/finance/budgets/variance-report?fiscalYear=2026` |
| POST | `/api/finance/budgets/validate` | AP/procurement hook |

`validate` supports `mode`: `HARD_BLOCK` | `WARN_ONLY`.

## Tax

| Method | Path |
|--------|------|
| POST | `/api/finance/tax/calculate` |
| GET | `/api/finance/tax/reports/summary?from=2026-01-01&to=2026-12-31` |

Set `persistSnapshot: true` and `invoiceRef` to store immutable `TaxInvoiceSnapshot` JSON for audit.

## Multi-currency & consolidation

| Method | Path |
|--------|------|
| POST | `/api/finance/currency/rates-update` |
| POST | `/api/finance/consolidation/run` |

Consolidation runs FX revaluation (unrealized gain/loss account `2200`) and intercompany elimination via `IntercompanyJournalEntry`.

## GL integration

All automated postings use `GlJournalEntry` / `GlJournalLine` with double-entry validation in `desktop/services/finance/gl.service.ts`. Default chart seeded on bootstrap (accounts `1000`–`6200`).

The renderer `gl-store.ts` (localStorage) remains for UI demo; new finance operations persist in SQLite and can be bridged in a later phase.
