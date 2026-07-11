# Benben ERP — Release Operations & Internationalization Report

**Date:** May 24, 2026  
**Phase:** Release operations + i18n foundation  
**Build:** `npm run build:desktop` · `nexuscore-erp-main npm run build` (verify locally)

---

## Executive summary

This phase adds release-management infrastructure (update checks, migration safety, licensing preparation), internationalization foundation (English + partial Spanish), support bundle export, and installer polish — without architecture changes, full ERP translation, or macOS/Linux builds.

---

## Phase 1 — Auto update foundation

| Component | Path |
|-----------|------|
| Settings | `nexuscore-erp-main/src/lib/update-settings.ts` |
| Service | `nexuscore-erp-main/src/lib/update-service.ts` |
| Main process | `desktop/services/update.service.ts` |
| IPC | `update:check` |

**Behavior:**
- Channels: `stable`, `beta`, `internal`
- Semver comparison; manifest fetch from configurable URL
- **No forced updates**; **no auto-install**
- UI: Settings → Release Management; banner on login when update available
- User can dismiss notification per version

---

## Phase 2 — Release channels & versioning

**Settings → Release Management** (`ReleaseManagementPanel.tsx`):

- App version (semver from Electron)
- Build timestamp / build version (`build-stamp.json`)
- Database schema version + latest migration name
- Migration run status
- Release channel selector
- Support bundle export

Build stamp now includes `version` and `releaseChannel` from `write-build-stamp.mjs`.

---

## Phase 3 — Database migration safety

| Feature | Implementation |
|---------|----------------|
| Pre-migration backup | `migration.service.ts` → `createPreMigrationBackup()` |
| Rollback on failure | Restores pre-migration backup via `restoreBackup()` |
| Status file | `%AppData%/Benben/migration-status.json` |
| Bootstrap integration | `database.ts` uses `runMigrationsSafe()` |

Diagnostics surface last migration success/failure and backup id.

---

## Phase 4 — Licensing preparation

| Artifact | Purpose |
|----------|---------|
| `license-store.ts` | Trial/activated modes, seat counts, placeholder key validation |
| `licensing.service.ts` | Desktop offline stub |
| `LicensingPanel.tsx` | Settings UI placeholder |
| `docs/LICENSING_STRATEGY.md` | Commercial strategy |

No online validation or payments.

---

## Phase 5 — i18n foundation

| Piece | Detail |
|-------|--------|
| Framework | `i18next` + `react-i18next` |
| Locales | `src/i18n/locales/en.json`, `es.json` (partial) |
| Provider | `I18nProvider` in root route |
| Settings | Language & Region panel |
| Future-ready | `fr`, `ar`, `zh-Hans` listed (disabled until translated) |

New Settings strings use `t()` — existing screens unchanged (progressive migration).

---

## Phase 5A — Localization

`locale-settings.ts` + `locale-format.ts`:

- `formatMoneyLocale` — org base currency + user locale
- `formatDateLocale` / `formatDateTimeLocale`
- `formatNumberLocale`
- `fmtMoney` / `fmtNum` in `ui-bits.tsx` delegate to locale formatters

---

## Phase 5B — PDF & email Unicode

- Email templates: `<meta charset="UTF-8">`, `sanitizeUnicodeText()`
- Nodemailer: `encoding: 'utf-8'`
- PDF: `sanitizeUnicodeText()` on header text
- **Note:** jsPDF Helvetica is Latin-1 limited; CJK/Arabic need embedded fonts (documented debt)

---

## Phase 6 — Installer polish

- `productName`: Benben ERP
- `artifactName`: `${productName}-${version}-${os}-${arch}.${ext}`
- `uninstallDisplayName`: Benben ERP
- `resources/RELEASE_NOTES.txt` placeholder
- EULA path unchanged (`resources/LICENSE.txt`)

---

## Phase 7 — Supportability

- IPC `support:exportBundle`
- `support-bundle.service.ts` — diagnostics, migration status, redacted config, log tail
- Settings → Export support bundle
- Redacts: passwords, tokens, SMTP secrets

---

## Phase 8 — Cross-platform readiness

Expanded [`docs/CROSS_PLATFORM_PREP.md`](CROSS_PLATFORM_PREP.md) with packaging strategy, macOS signing, Linux targets, Electron concerns.

---

## Phase 9 — Validation checklist

| Check | Status |
|-------|--------|
| Desktop TypeScript compile | Run `npm run build:desktop` |
| UI build | Run `npm run build` in `nexuscore-erp-main` |
| `npm run dist` | Run with devDependencies installed |
| Update check UI | Settings → Check for updates |
| Language switch | Settings → Español (partial strings) |
| Support bundle | Settings → Export |
| Migration safety | Automatic on app start |
| EULA / legal email | Unchanged — verify in installer |

---

## Remaining blockers before public release

1. **Production update manifest** — Host `manifest.json` on CDN with real download URLs
2. **Full i18n** — Most UI strings still English-only
3. **PDF CJK/RTL fonts** — Required for Arabic/Chinese invoices
4. **License server** — Offline/online activation not enforced
5. **Auto-install updates** — Intentionally deferred
6. **npm install** — Use `NODE_ENV=development` for dist so Electron devDeps install

---

## Files added (summary)

**Renderer:** `update-settings.ts`, `update-service.ts`, `release-settings.ts`, `license-store.ts`, `locale-settings.ts`, `locale-format.ts`, `i18n/*`, `ReleaseManagementPanel`, `LanguageRegionPanel`, `LicensingPanel`, `UpdateNotificationBanner`, `I18nProvider`

**Desktop:** `update.service.ts`, `migration.service.ts`, `licensing.service.ts`, `support-bundle.service.ts`, IPC handlers

**Docs:** `LICENSING_STRATEGY.md`, `RELEASE_OPS_I18N_REPORT.md`, expanded `CROSS_PLATFORM_PREP.md`

---

*Architecture, bridges, and persistence layers unchanged.*
