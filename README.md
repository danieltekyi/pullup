# PullUp

<p align="center">
  <strong>Premium delivery-management platform for bike/motorcycle courier businesses.</strong><br />
  Multi-branch • Offline-first PWA • Partner APIs • WhatsApp / SMS / Email • CDK-deployable
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/DEPLOYMENT.md">Deployment</a> ·
  <a href="SECURITY.md">Security</a>
</p>

---

## What's inside

| Package | Purpose |
| --- | --- |
| `apps/backend` | Express + Lambda API — hardened Cognito JWTs, DynamoDB with GSIs, S3 proof-of-delivery, per-action idempotent sync, rate limiting, structured logging |
| `apps/frontend` | React 18 + Vite + Tailwind PWA — admin console, dedicated **rider mobile app**, offline queue, Web Push, Sentry |
| `packages/shared` | Cross-package types, permission model, physics pricing engine |
| `infra/cdk` | 4-stack CDK (data + auth + api + web) with WAF, CloudFront, PITR, Secrets Manager |
| `e2e` | Playwright smoke tests |

## Feature highlights

- **Order lifecycle** — pending → assigned → picked up → in transit → delivered → confirmed, with a full audit event log per order
- **Rider PWA** — one-tap actions, signature capture, camera proof, GPS breadcrumbs, offline queue with per-action reconciliation
- **Customer notifications** — Email (SMTP), SMS (Africa's Talking), WhatsApp (Twilio) — one clean interface per channel
- **Web Push** for rider assignment alerts
- **Partner API ingestion** — polls partner GET endpoints, pushes status back via PUT callbacks
- **Two pricing engines** — bidirectional zone-rate matrix and a physics-based cost model (fuel, wear, load, terrain, margin)
- **COD reconciliation**, failed-delivery reasons, SLA fields, priority flags
- **Multi-branch RBAC** — Cognito groups + per-role permission matrix
- **CSV import/export**, filters, search, pagination
- **Optimistic-concurrency writes** — no more clobbered updates
- **Infra as code** — every AWS resource in CDK; `cdk deploy` gives a working stack from scratch

## Quick start

```bash
# 1. Install
git clone https://github.com/Stekyi/pullup.git
cd pullup
npm install
npm run shared:build

# 2. Configure
cp apps/backend/.env.example apps/backend/.env       # fill in Cognito + AWS
cp apps/frontend/.env.example apps/frontend/.env     # fill in Cognito + API URL

# 3. Run locally (two terminals)
npm run backend:dev    # http://localhost:3000
npm run frontend:dev   # http://localhost:5173
```

Deploy to AWS:

```bash
cd infra/cdk
npm install
npx cdk bootstrap aws://<ACCOUNT>/<REGION>   # once per account
npm run deploy:dev
```

## Deployment options

- **Backend** — AWS via CDK: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Frontend (Cloudflare Pages)** — three subdomains of `aegisassetllc.com`: [docs/CLOUDFLARE_PAGES.md](docs/CLOUDFLARE_PAGES.md)

### Three-site architecture

The `apps/frontend` codebase compiles into three separate builds — one per audience — controlled by `VITE_APP_MODE`:

| Site | Domain | Mode |
| --- | --- | --- |
| Admin console | `pullup.aegisassetllc.com` | `VITE_APP_MODE=admin` |
| Rider PWA | `pulluprider.aegisassetllc.com` | `VITE_APP_MODE=rider` |
| Public customer | `pullupcustomer.aegisassetllc.com` | `VITE_APP_MODE=customer` |

Each build only ships the code that audience needs — the rider domain never serves admin routes, the customer domain never loads Cognito auth.

```bash
# Local
npm run frontend:dev              # admin (default)
npm --workspace=@pullup/frontend run dev:rider
npm --workspace=@pullup/frontend run dev:customer

# Build all three
npm --workspace=@pullup/frontend run build:all
# → apps/frontend/dist-admin/  dist-rider/  dist-customer/
```

## Testing

```bash
npm test            # all unit tests (backend + frontend)
npm run e2e         # Playwright smoke tests (needs a running app)
npm run typecheck
npm run lint
```

## Structure

```
pullup/
├── apps/
│   ├── backend/            Express + Lambda API
│   └── frontend/           React PWA (admin + rider)
├── packages/
│   └── shared/             Types, permissions, physics engine
├── infra/cdk/              AWS infrastructure
├── e2e/                    Playwright tests
├── docs/                   Architecture + deployment guides
└── .github/workflows/      CI + Deploy + CodeQL
```

## Security

Full details in [SECURITY.md](SECURITY.md). Never commit `.env` files. Rotate leaked secrets immediately — see [SECRETS_ROTATION.md](SECRETS_ROTATION.md).

## License

MIT — see [LICENSE](LICENSE).
