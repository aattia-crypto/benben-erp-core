# Finance modules — Prisma schema migration summary

**Apply with:** `npm run db:migrate` (dev) or automatic `migrate deploy` on app start (production).

## Schema version

`AppMeta.schemaVersion` remains `1` until a data migration script bumps it; new tables are additive via migration `20260523233442_finance_gl_modules`.

## New domains

| Domain | Tables |
|--------|--------|
| General Ledger | `GlAccount`, `GlJournalEntry`, `GlJournalLine` |
| Bank reconciliation | `BankStatement`, `BankTransaction`, `ReconciliationLog` |
| Fixed assets | `AssetCategory`, `FixedAsset`, `DepreciationSchedule`, `DepreciationRun` |
| Budgeting | `CostCenter`, `BudgetPlan`, `BudgetLineItem` |
| Tax compliance | `TaxZone`, `TaxRate`, `TaxInvoiceSnapshot`, `TaxAuditLog` |
| Multi-currency | `CurrencyExchangeRate`, `IntercompanyJournalEntry`, `ConsolidationRun` |

## GL integration

- All automated postings (depreciation, FX revaluation, consolidation eliminations) create balanced `GlJournalEntry` + `GlJournalLine` rows.
- Bank reconciliation links `BankTransaction` ↔ `GlJournalLine` via `ReconciliationLog`.
- Budget checks read posted expense lines; optional hook from AP (localStorage) via API.

## SQLite notes

- Amounts stored as `Float` (USD cents precision: round in services).
- Status fields stored as `String` enums for SQLite compatibility.
- No breaking changes to `User`, `Session`, `Settings`, `AuditLog`.

## API surface

Local HTTP server (default `127.0.0.1:3847`) mounted at `/api/finance/*` inside the Electron main process. Same services are usable from IPC later.
