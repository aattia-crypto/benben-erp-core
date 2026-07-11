# Safe Next Steps — Incremental Implementation Order

**Purpose:** Minimize risk between phases. Do not skip stabilization gates.  
**Rule:** One vertical slice at a time; adapter + IPC + Prisma before touching unrelated UI.

---

## Before any new feature work

1. Run full verification:
   ```powershell
   cd C:\Users\Tax\Documents\Benben_Desktop
   npm run verify
   ```
2. Confirm two-terminal dev flow (UI + Electron) still works.
3. If `verify:phase2` fails on `initializeAdmin`, it usually means the AppData DB already has users — use a fresh DB or test with `login` only (expected).

---

## Recommended order

### Step 1 — Session persistence (small, high value)

**Why first:** Users must stay signed in after restart before adding modules.

| Layer | Work |
|-------|------|
| Desktop | Persist token hash reference in `config.json` or encrypted file under AppData |
| Preload | Restore token on startup; call `getSession` |
| ERP | Optional: `hydrateDesktopSession()` on app load in root route only |

**Do not:** Rewrite auth-store or login UI.

---

### Step 2 — Settings IPC

**Why:** Company name/org already used by auth; unlocks branding and printer prefs.

| Layer | Work |
|-------|------|
| Prisma | `Settings` model already exists |
| Desktop | `settings.service.ts` + `settings.ipc.ts` (get/update) |
| Preload | Expose `benben.settings.*` |
| ERP | Thin `desktop-api` helpers; optional single hook in workspace-store |

**Do not:** Migrate backup-engine or mock-data yet.

---

### Step 3 — Auth completion (still isolated)

| Item | Notes |
|------|------|
| `changePassword` IPC | bcrypt update + audit log |
| `adminCreateUser` IPC | Single-org desktop admin only |
| Remove shadow drift | Document single source of truth |

**Do not:** Touch payroll, GL, AR/AP.

---

### Step 4 — Customers & vendors (CRM)

**Why:** First business module; maps to existing `crm.tsx` + `mock-data` entities.

| Order | Work |
|-------|------|
| 1 | Prisma models: `Customer`, `Vendor` (or unified `Entity`) |
| 2 | Migration |
| 3 | `customers.ipc.ts` / `vendors.ipc.ts` + services |
| 4 | Preload + `desktop-api` list/get/create/update |
| 5 | Adapter in CRM route only — keep mock fallback in browser |

---

### Step 5 — Dashboard read-only aggregates

Wire KPIs to SQLite counts/sums via IPC.  
**Do not** rebuild dashboard UI.

---

### Step 6 — Inventory

Supply-chain route + stock tables.  
RBAC checks stay in existing `rbac.ts` until server mode.

---

### Step 7 — Invoicing

Invoice + line models; print scaffold later.

---

### Step 8 — Operations (backup / export / print)

| Item | Dependency |
|------|------------|
| Backup restore UI | `backup.service.ts` already copies DB |
| Export/import manifest | AppData `exports/` / `imports/` |
| Printing | `webContents.print()` / PDF |

---

### Step 9 — Production packaging

| Item | Notes |
|------|------|
| TanStack client bundle for Electron | Requires explicit strategy (see PROJECT_STATE) |
| `electron-builder` test on clean VM | NSIS installer |
| Code signing | When certificates ready |

---

## What NOT to do next

- Do not merge `nexuscore-erp-main` into root `src/`
- Do not add Supabase, Firebase, Docker, or REST microservices
- Do not rewrite TanStack routes or shadcn components wholesale
- Do not run `npm audit fix --force` without testing Electron major bump
- Do not migrate all `localStorage` keys at once (backup-engine, POS, etc.)

---

## Phase 3 approval gate

Approve **one** of:

- [ ] **3a** — Session persistence only  
- [ ] **3b** — Settings IPC only  
- [ ] **3c** — CRM customers/vendors (larger slice)

Default recommendation: **3a → 3b → 4 (CRM)**.

---

## File touch policy (reminder)

| Area | Policy |
|------|--------|
| `nexuscore-erp-main/src/routes/*` | Change only when wiring that route’s adapter |
| `nexuscore-erp-main/src/components/*` | Avoid unless required |
| `desktop/services/*` | Primary location for new logic |
| `prisma/schema.prisma` | Add models incrementally with migrations |
