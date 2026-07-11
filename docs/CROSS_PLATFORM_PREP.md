# Benben ERP — Cross-Platform Preparation

**Status:** Windows Release Candidate shipping; macOS/Linux not built yet.  
**Goal:** Document portability work so future platform builds do not require architecture changes.

---

## Centralized platform utilities

| Module | Purpose |
|--------|---------|
| `desktop/utils/platform.ts` | OS detection (`win32` / `darwin` / `linux`), path normalization |
| `desktop/utils/paths.ts` | App data root via `resolveUserDataParent()` + `APP_NAME` (no hard-coded `%APPDATA%`) |

All filesystem access for production data should go through `paths.ts`, not inline `C:\` or `process.env.APPDATA`.

---

## Windows-specific assumptions today

| Area | Windows behavior | macOS/Linux note |
|------|------------------|------------------|
| **Installer** | NSIS via `electron-builder --win` | Use `.dmg` / `.pkg` or AppImage/deb |
| **Prisma query engine** | `query_engine-windows.dll.node` | Ship platform-specific engine binary in `extraResources` |
| **Code signing** | `signtool.exe` in dist pipeline | Apple notarization / Linux optional GPG |
| **Default paths** | `%APPDATA%/Benben ERP` via `resolveAppDataRoot()` | `~/Library/Application Support/Benben ERP` / `~/.config/Benben ERP` |
| **Dialog IPC** | `dialog.pickFolder` uses Electron native dialogs | Same API — portable |
| **Finance API** | `127.0.0.1:3847` loopback | Same — no change |
| **Migrations** | `ELECTRON_RUN_AS_NODE` + bundled Prisma CLI | Verify CLI path in `.app` bundle |

---

## Electron APIs in use (portability)

| API | Portable? |
|-----|-----------|
| `app.getPath('userData')` | Yes — parent used for cross-platform root |
| `BrowserWindow`, `dialog`, `shell.openExternal` | Yes |
| `contextBridge` / `ipcMain` | Yes |
| `app.isPackaged` | Yes |

---

## Packaging requirements (future)

### macOS
- `electron-builder` target: `dmg` or `zip`
- Entitlements for file access under Application Support
- Prisma engine: `libquery_engine-darwin.dylib` (arm64 + x64 if universal)
- Hardened runtime + notarization for Gatekeeper

### Linux
- Targets: `AppImage`, `deb`, or `rpm`
- Prisma engine: `libquery_engine-debian-openssl-*.so.node`
- Desktop entry / `.desktop` file for menu integration
- Optional `sqlite3` ICU — not required (Prisma uses bundled engine)

---

## Renderer / UI

- TanStack Start static client build is platform-agnostic.
- `renderer-dist/` staging script is OS-neutral.
- No `window` APIs beyond standard web + `window.benben` preload bridge.

---

## Remaining Windows-only dependencies

1. **electron-builder config** — `electron-builder.yml` currently Windows-only targets.
2. **CI scripts** — `npm run dist` invokes `--win` only.
3. **Legal/installer** — NSIS EULA flow (`resources/LICENSE.txt`).
4. **Verify scripts** — `verify-packaged-prisma.mjs` may assume `.exe` layout.

---

## Recommended pre-build checklist (macOS/Linux)

1. Extend `electron-builder.yml` with platform targets and `extraResources` for Prisma engines.
2. Run `prisma generate` per target arch in CI matrix.
3. Smoke-test: migrations, backup folder, SMTP, PDF export, Finance API.
4. Validate app data path on fresh user account.
5. Update installer/legal artifacts per platform store requirements.

---

## Recommended packaging strategy

| Platform | Primary target | Update delivery |
|----------|----------------|-----------------|
| Windows | NSIS x64 (`npm run dist`) | Signed installer + optional delta via manifest URL |
| macOS | Universal DMG or ZIP | Notarized `.dmg`; Sparkle or custom manifest (future) |
| Linux | AppImage + deb | GPG-signed AppImage; apt repo optional |

**CI matrix (future):** `windows-latest`, `macos-14`, `ubuntu-22.04` — each runs `prisma generate`, platform engine copy, `electron-builder` per OS.

---

## macOS signing requirements

1. **Apple Developer ID Application** certificate
2. **Hardened Runtime** entitlements for file access, networking (SMTP, update check)
3. **Notarization** with `notarytool` stapled to DMG/ZIP
4. **Gatekeeper** — users must not see “unidentified developer” after notarization
5. Prisma: ship `libquery_engine-darwin.dylib` for arm64 + x64 in `extraResources`

---

## Linux distribution recommendations

1. **AppImage** — best for portable manufacturing installs (single file, no root)
2. **deb** — IT-managed Ubuntu/Debian deployments
3. **rpm** — RHEL-derived sites (optional)
4. Dependencies: OpenSSL 3.x aligned with Prisma engine variant
5. Desktop integration: `.desktop` file with `Categories=Office;Finance`

---

## Electron portability concerns

| Concern | Mitigation |
|---------|------------|
| `execFileSync(process.execPath, [prismaCli, ...])` | Works on all platforms with `ELECTRON_RUN_AS_NODE=1` |
| `fetch` for updates | Main-process only; no CORS |
| `nodemailer` | Pure JS — portable |
| Path separators | Always use `path.join` via `paths.ts` |
| Case-sensitive FS | Linux CI must validate `renderer-dist` casing |
| Auto-updater | Not enabled yet; use manifest + manual download per phase |

---

## Backup & support paths (portable)

- Backups: `{AppData}/Benben ERP/backups/` — OS-agnostic via `getAppDataRoot()`
- Support bundles: `{AppData}/Benben ERP/exports/support-bundle-*`
- Logs: `{AppData}/Benben ERP/logs/`
- Migration status: `{AppData}/Benben ERP/migration-status.json`

---

## Shell / command assumptions

- No `cmd.exe` or PowerShell required at runtime
- Prisma CLI invoked via Electron Node — no separate `node` on PATH
- Avoid `shell: true` in child processes

---

*Updated for Release Operations phase — Windows RC ships; macOS/Linux builds not started.*
