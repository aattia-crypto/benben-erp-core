# Benben — Licensing Strategy (Preparation)

**Status:** Architecture only — no paid enforcement, no online validation, no payment integration.

---

## Goals

- Support future **trial**, **subscription**, and **perpetual** models
- **Offline activation** for air-gapped manufacturing sites
- **Seat-based** licensing aligned with concurrent users
- No disruption to current RC deployments (trial defaults active)

---

## License object (renderer: `license-store.ts`)

| Field | Purpose |
|-------|---------|
| `mode` | `trial` \| `activated` \| `expired` \| `unlicensed` |
| `organizationId` | Tenant identifier |
| `seatCount` / `seatsUsed` | Capacity tracking |
| `activationKey` | Customer-facing key (format `NXC-XXXX-XXXX-XXXX` placeholder) |
| `offlineToken` | Local proof of activation without server |
| `expiresAt` | Subscription end (optional) |

Desktop stub: `desktop/services/licensing.service.ts` — offline key format validation only.

---

## Planned activation flows

### Trial (current default)
- 30-day trial from first launch (`trialStartedAt`)
- Full feature access; banner in Settings → Licensing

### Online activation (future)
1. Customer enters key in Settings
2. App calls license API (HTTPS) → signed JWT/blob
3. Store `offlineToken` + seat count locally

### Offline activation (future)
1. Customer receives signed `.benben-license` file
2. Import via Settings or file picker
3. `licensing.service` verifies RSA signature against embedded public key

---

## Seat tracking

- Increment `seatsUsed` on unique user login (desktop auth session)
- Block new users when `seatsUsed >= seatCount` (soft warning first, hard block later)
- Admin override in Settings (role-gated)

---

## What is explicitly out of scope (this phase)

- Stripe/payment portal
- License server deployment
- Key generation tooling
- Legal entitlement contracts

---

## Security notes (future)

- Never store raw activation secrets in SQLite
- Sign license payloads; bind to `organizationId` + machine fingerprint (optional)
- Rotate keys via release channel manifest

---

*See Settings → Licensing for the activation UI placeholder.*
