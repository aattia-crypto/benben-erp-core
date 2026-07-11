# Benben ERP — Production Hardening Report

**Date:** May 24, 2026  
**Phase:** Production hardening + commercial readiness  
**Build:** `npm run build:desktop` ✅ · `nexuscore-erp-main` `npm run build` ✅

---

## Executive summary

This phase completed operational hardening without architectural changes: real SMTP delivery, full PDF coverage, scheduled SQLite backups with retention, enterprise-style error recovery, performance tuning for long sessions, cross-platform preparation documentation, and release diagnostics in Settings.

---

## Phase 1 — Email delivery completion

| Feature | Implementation |
|---------|----------------|
| SMTP send (main process) | `desktop/services/email.service.ts` (nodemailer) |
| IPC | `email:send`, `email:test`, `email:verifyConnection` |
| Renderer bridge | `lib/desktop-email.ts` |
| Templates | `lib/email-templates.ts` (invoice, statement, CRM reminder, test) |
| Test email | Settings → verify connection + send test |
| Invoice email | AR invoice detail → **Email** |
| Statement email | Customer ledger → **Email statement** |
| CRM reminders | CRM directory → per-reminder **Email** |

**Behavior:** Graceful errors, delivery result with `attemptedAt`, client error log on failure. No marketing/campaign engine.

---

## Phase 2 — PDF system completion

| Item | Status |
|------|--------|
| AP bill PDF | `ApBillDetailPanel` → PDF |
| Finance report PDF | `/finance-reports` → branded table PDF |
| Company logo in header | `logoDataUrl` via jsPDF `addImage` |
| Org base currency | `formatOrgMoney()` uses `OrgProfile.baseCurrency` |
| Page breaks | autotable `pageBreak: auto`, footer on report pages |
| Shared builders | `lib/pdf-document-builders.ts` |

---

## Phase 3 — Automated backup system

| Feature | Implementation |
|---------|----------------|
| Scheduled backups | `backup-scheduler.service.ts` — interval from policy |
| Retention | Scheduled backups only; manual never auto-deleted |
| Verification | SQLite header check per backup; UI **Verify** |
| Manifest | `manifest.json` per backup (`kind`, `verified`) |
| Policy file | `%AppData%/Benben ERP/backup-policy.json` |
| UI | `ProductionBackupPanel` — enable, hours, keep count/days, health status |

Scheduler starts in `main.ts` on app ready; checks every 15 minutes.

---

## Phase 4 — Error handling & recovery

| Protection | Detail |
|------------|--------|
| React error boundary | `AppErrorBoundary` wraps `AppLayout` |
| Route errors | TanStack `errorComponent` (unchanged) |
| DB integrity at startup | `db-integrity.service.ts` — blocks launch if corrupt file exists |
| Finance API | One retry + `friendlyFinanceApiError()` |
| Client error log | `error-log.ts` — last 50 events, shown in diagnostics |
| Restore safeguard | Restore requires verified backup; pre-restore DB copy |

---

## Phase 5 — Performance & long sessions

| Change | Detail |
|--------|--------|
| Polling | AR/AP/GL hooks use `useVisibleInterval` (45–60s, only when tab visible) |
| Finance dashboard | 60s visible interval vs 20s always-on |
| Finance reports | Table view with scroll instead of raw JSON dump |

No virtual scrolling added (avoid scope creep); tables use `max-h` overflow.

---

## Phase 6 — Cross-platform preparation

**Document:** [`docs/CROSS_PLATFORM_PREP.md`](CROSS_PLATFORM_PREP.md)

- `desktop/utils/platform.ts` for OS detection
- `paths.ts` uses portable app data parent
- Installer/Prisma/signing differences documented for macOS/Linux

**No macOS/Linux builds produced in this phase.**

---

## Phase 7 — Release operations

**Settings → Release & diagnostics** (`ReleaseDiagnosticsPanel`):

- App / Electron / Node versions
- Packaged vs dev mode
- UI staging timestamp
- Database path, schema version, latest migration, migration count
- DB integrity status
- Finance API URL
- Recent client errors (clearable)

IPC: `app:getDiagnostics` → `app.service.getAppDiagnostics()`

---

## Phase 8 — Validation checklist

| Check | Status |
|-------|--------|
| `npm run build:desktop` | ✅ |
| `nexuscore-erp-main` `npm run build` | ✅ |
| `npm run dist` | Run locally (`NODE_ENV=development` required for full devDependencies) |
| Installer / EULA | Unchanged |
| Onboarding | Unchanged (prior phase) |
| Backups | Manual + scheduled + retention |
| PDFs | AR, AP, reports |
| SMTP test | Settings panel |
| Error boundary | Global wrap |

---

## Files added (key)

**Desktop:** `email.service.ts`, `email.ipc.ts`, `backup-scheduler.service.ts`, `backup-config.service.ts`, `db-integrity.service.ts`, `platform.ts`

**Renderer:** `desktop-email.ts`, `email-templates.ts`, `pdf-document-builders.ts`, `AppErrorBoundary.tsx`, `ReleaseDiagnosticsPanel.tsx`, `use-visible-interval.ts`, `finance-api-errors.ts`, `error-log.ts`

---

## Remaining technical debt

1. **Email + PDF attachment** — Send invoice PDF as MIME attachment (currently HTML body only).
2. **CRM contact email field** — Entity model uses `contact` string; add dedicated `email` on Entity.
3. **API-level permissions** — Route matrix exists; Finance API middleware still light.
4. **Backup encryption** — Backups are plain copies; optional AES for regulated customers.
5. **macOS/Linux builds** — Documented only; CI matrix not configured.
6. **npm production installs** — Use `NODE_ENV=development` or `npm install --include=dev` before `dist` so Electron devDependencies install.

---

## Recommendations before public launch

1. Run `npm run dist` on a clean machine with devDependencies installed; smoke-test SMTP with real provider (Office 365, Gmail app password, etc.).
2. Leave app open 2+ hours — confirm memory stable and polling pauses when minimized.
3. Enable auto-backup 24h; confirm scheduled folders rotate and manual backups persist.
4. Deliberately corrupt a copy of `benben.db` in a test profile — confirm startup blocks with recovery message.
5. Complete macOS feasibility spike using `CROSS_PLATFORM_PREP.md` before promising multi-OS support.

---

*Architecture, bridges, Prisma write path, and packaging pipeline structure unchanged.*
