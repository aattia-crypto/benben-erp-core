# Benben ERP — Commercial Stabilization Report

**Date:** May 19, 2026  
**Phase:** Commercial stabilization + final polish  
**Build status:** `npm run build` ✅ · `npm run dist` ✅ (root `package.json`)

---

## Executive summary

This phase focused on commercial readiness without architectural changes. Dashboard KPI overflow was addressed, a multi-step first-run wizard was added, production SQLite backup/restore was wired to the UI, branded PDF export was introduced, company branding and SMTP foundation settings were added, and help content was expanded for onboarding and operations.

---

## Phase 1 — Dashboard UI polish

### Changes
- **`KpiGrid` + `StatCard`** (`ui-bits.tsx`): `min-w-0`, `overflow-hidden`, `truncate`, responsive column breakpoints, tooltips on truncated values.
- Applied consistently to:
  - Main dashboard (`index.tsx`)
  - Finance Workspace (`finance-workspace.tsx`)
  - AR / AP (`ar.tsx`, `ap.tsx`)
  - CRM dashboard tab (`crm.tsx`)
  - Customer 360 (`customer-360.tsx`)
  - General Ledger (`accounting.tsx`)

### Result
Percentage and currency values no longer overflow card boundaries on common desktop resolutions (1280×720 through 1920×1080 and ultrawide).

---

## Phase 2 — Commercial stabilization

### 2A — First-run experience
| Feature | Implementation |
|--------|----------------|
| Welcome screen | `setup.tsx` step 1 |
| Company setup | Step 2 — legal name, tagline |
| Fiscal year / currency / tax | Step 3 |
| Demo data toggle | Step 3 checkbox → `OrgProfile.loadDemoData` |
| Admin account | Step 4 |
| Persistence | `org-profile.ts`, `workspace-store.ts`, `company branding` |
| Existing users | `AppLayout` calls `markOnboardingComplete()` when workspace already initialized |

Onboarding appears only when workspace is not initialized (`/setup` gate unchanged).

### 2B — Backup & restore
| Layer | Path |
|-------|------|
| Desktop service | `desktop/services/backup.service.ts` — `restoreBackup()` copies DB + config, pre-restore safety copy |
| IPC | `desktop/ipc/backup.ipc.ts` |
| UI wrapper | `lib/desktop-backup.ts` |
| Settings UI | `ProductionBackupPanel.tsx` — create, list, confirm restore, last backup timestamp |

Automated localStorage snapshots in Settings remain for lightweight exports; production backup is the full SQLite recovery path.

### 2C — PDF document engine
| Item | Detail |
|------|--------|
| Module | `lib/document-pdf.ts` (jsPDF + autotable) |
| Types | invoice, statement, receipt, purchase_order |
| Branding | Header from `CompanyBranding`, footer text, base currency |
| UI entry | AR invoice detail → **PDF** button (`ArInvoiceDetailPanel.tsx`) |

### 2D — Company branding
| Item | Detail |
|------|--------|
| Storage | `benben.company.branding.v1` |
| UI | `BrandingSettingsPanel.tsx` in Settings |
| Fields | Logo (base64), legal name, address, tax ID, footer, fiscal/currency/tax region |

### 2E — Email settings foundation
| Item | Detail |
|------|--------|
| Storage | `benben.email.settings.v1` |
| UI | `EmailSettingsPanel.tsx` — SMTP host/port/user/password, from name/email, TLS, test button (foundation toast only) |

No campaign or bulk send implemented (by design).

---

## Phase 3 — UX & consistency pass

- Unified KPI presentation across finance, CRM, and AR/AP surfaces.
- `DataSourceBadge` retained on operational screens.
- Settings grouped: health → production backup → branding → email → demo tools.
- Modal and table patterns unchanged (no risky refactors).

---

## Phase 4 — Performance & stability

- PDF and demo seed loaded via dynamic import where appropriate.
- No persistence or bridge architecture changes.
- Recommended manual checks: large AR invoice lists, Customer 360 timeline with many events.

---

## Phase 5 — Help & user guidance

New **`GettingStartedHelpGuides.tsx`** embedded in Help → Initial Setup:
- Getting started (wizard steps)
- Accounting workflow overview
- CRM workflow overview
- Backup & restore guide
- Report & PDF export guide

Existing Finance, AR/AP, and CRM module guides retained.

---

## Phase 6 — Release verification checklist

| Check | Status |
|-------|--------|
| `npm run build` | ✅ Passed |
| `npm run dist` | ✅ Passed — installer under `release/` |
| Installer / EULA | Unchanged this phase (`resources/LICENSE.txt`) |
| Onboarding flow | New install → `/setup` wizard |
| Backup / restore | Settings → Production backup (desktop only) |
| PDF generation | AR invoice detail → PDF |
| Dashboard overflow | KpiGrid/StatCard on all listed routes |
| Post-install launch | Existing smoke test recommended |

---

## Architecture preserved

- No removal of `gl-store`, `ar-store`, `ap-store`, or bridge layers.
- Finance API + Prisma write path unchanged.
- Packaging pipeline not modified except consuming new UI assets.

---

## Remaining technical debt

1. **SMTP test email** — UI saves settings; actual nodemailer/desktop send not wired.
2. **PDF coverage** — AP bills, POs, and finance reports need same `exportBrandedPdf` buttons as AR.
3. **Logo in PDF header** — Text branding only; `logoDataUrl` not yet rendered in jsPDF.
4. **Onboarding vs demo seed** — `AppLayout` still enriches demo metadata for all sessions; consider gating on `loadDemoData`.
5. **Currency in PDF** — `money()` uses USD format; should read `OrgProfile.baseCurrency`.
6. **Dual backup systems** — Document clearly for users: localStorage snapshots vs SQLite production backup.

---

## Recommendations before public release

1. Run full installer test on a clean VM: setup wizard → login → create production backup → restore → restart.
2. Add PDF export to AP bill detail and Sales Invoicing list.
3. Implement real SMTP send behind feature flag for invoice email.
4. Add `logoDataUrl` to PDF header when present.
5. Publish a one-page “Backup strategy” PDF for IT admins.
6. Regression pass on EULA email (`legal@benbenerp.com`) in built installer.

---

## Files added / materially changed (summary)

**New:** `org-profile.ts`, `desktop-backup.ts`, `document-pdf.ts`, `ProductionBackupPanel.tsx`, `BrandingSettingsPanel.tsx`, `EmailSettingsPanel.tsx`, `GettingStartedHelpGuides.tsx`

**Updated:** `setup.tsx`, `settings.tsx`, `AppLayout.tsx`, `ui-bits.tsx`, `backup.service.ts`, dashboard routes (AR/AP/CRM/360/accounting), `ArInvoiceDetailPanel.tsx`, `help.tsx`

---

*Report generated as part of Commercial Stabilization phase.*
