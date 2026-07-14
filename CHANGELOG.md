# Changelog

## [2.0.0] — 2026-07-14

**Complete rewrite** targeting production-readiness. Breaks compatibility with v1 (`pullapp`) — migration required.

### Added
- **Dedicated rider mobile PWA** (`/rider`) with one-tap actions, signature capture, camera-based proof-of-delivery upload to S3, GPS breadcrumbs
- **Web Push notifications** (VAPID) for new-assignment alerts
- **Order event log** table + per-order timeline UI (full audit trail)
- **Customer entity** with repeat-order tracking + `gsi_phone` GSI
- **COD reconciliation** with outstanding-balance dashboard KPI
- **Failed-delivery reasons** with structured enum (`recipient_not_home`, `wrong_address`, `refused`, `damaged`, `unreachable`, `other`)
- **SLA / priority** fields on orders
- **Filters, search, pagination, CSV export** on the Orders page
- **SMS via Africa's Talking**, **WhatsApp via Twilio** — pluggable notification adapters
- **Google Maps distance** helper (optional)
- **M-Pesa Daraja B2C** payout scaffold (rider earnings)
- **CDK infrastructure-as-code** — 4 stacks (data/auth/api/web), 14 DynamoDB tables with GSIs and PITR, Cognito, Lambda, API Gateway, S3 + CloudFront + WAF, Secrets Manager
- **GitHub Actions CI/CD** with OIDC-federated deploys + CodeQL
- **Vitest** unit tests + **Playwright** E2E smoke tests
- **Sentry** browser instrumentation hook
- **Structured logging** via Pino with redaction rules

### Changed (from v1)
- **JWT verification hardened** — algorithm pinning, issuer + audience + `token_use` checks; invalid tokens now 401 (v1 silently passed)
- **All Scans replaced with Query** on GSIs (`gsi_branch_created`, `gsi_rider_created`, `gsi_partner_ref`, etc.)
- **Optimistic-concurrency writes** via `UpdateExpression` + version check (fixes v1 read-modify-write races)
- **`updatedAt`, `version`, `deletedAt`** on every entity
- **`/api/sync` returns per-action results** so the client dequeues only successful ones (fixes v1 lost-action bug)
- **`/api/sync` requires auth** (v1 was public — critical security fix)
- **`/api/tracker/*` requires auth** (v1's silent-pass `verifyCognitoToken` made these public)
- **Zone rates and zones scoped to branch** with GSI
- **Rate limiting** on global, tracker, and auth endpoints
- **Design system rebuild** — Tailwind + component library, replacing all v1 inline styles
- **Real service worker** via `vite-plugin-pwa` (v1's `sw.js` referenced `__WB_MANIFEST` but the plugin wasn't wired up)

### Removed
- Hardcoded AWS credentials, SMTP passwords, and tracker secrets committed in v1 `.env`
- `pullapp/backend/function.zip` (11 MB build artifact committed to source)
- v1's dangling `EXISTS.txt` sentinel files
- `admin.ts /migrate-branch` full-scan migration (replaced with CDK-managed schema evolution)

### Security notes
See [SECRETS_ROTATION.md](SECRETS_ROTATION.md) for the list of v1 secrets that must be rotated.
