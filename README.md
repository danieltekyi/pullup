# PullUp

Production-grade delivery management platform. **100% Cloudflare** — Pages for
three role-specific frontends, Workers for the API, D1 for storage, R2 for
proof-of-delivery images, Access for zero-trust auth.

## Architecture

```
┌────────────────────────────┐  ┌────────────────────────────┐  ┌────────────────────────────┐
│  pullup.aegisassetllc.com  │  │ pulluprider.aegisassetllc..│  │pullupcustomer.aegisassetll.│
│  Admin console             │  │  Rider PWA                 │  │  Public landing + tracking │
│  Pages · behind Access     │  │  Pages · behind Access     │  │  Pages · public            │
└─────────────┬──────────────┘  └─────────────┬──────────────┘  └─────────────┬──────────────┘
              │                                │                              │
              └───────┬────────────────────────┴─────────────────┬────────────┘
                      │                                          │
                      ▼                                          ▼
        ┌────────────────────────────────┐   ┌────────────────────────────────┐
        │  api.aegisassetllc.com         │   │ Cloudflare Access (Zero Trust) │
        │  Cloudflare Workers · Hono     │──▶│  Google / OTP / GitHub login   │
        │  Cf-Access-Jwt-Assertion       │◀──│  Groups: admins, riders        │
        └────────────┬───────────────────┘   └────────────────────────────────┘
                     │
                     ├─────▶ D1 (SQLite, 14 tables, indexed)
                     ├─────▶ R2 (proof-of-delivery images)
                     ├─────▶ KV (session bits, tracker cache)
                     └─────▶ MailChannels / Africa's Talking / Twilio
```

## What's inside

| Package | Purpose |
| --- | --- |
| `apps/api` | Hono on Cloudflare Workers — verifies Access JWT, all business logic |
| `apps/frontend` | React + Tailwind PWA — builds three modes: admin / rider / customer |
| `packages/shared` | Cross-package types, permission model, physics pricing engine |
| `e2e` | Playwright smoke tests |

## Feature highlights

- **Order lifecycle** — pending → assigned → picked up → in transit → delivered → confirmed, with an audit event log per order
- **Rider PWA** — one-tap actions, signature capture, camera proof (uploaded to R2), GPS breadcrumbs, offline queue with per-action reconciliation
- **Customer notifications** — Email (MailChannels), SMS (Africa's Talking), WhatsApp (Twilio) — pluggable
- **Web Push** for rider assignment alerts
- **Partner API ingestion** — Worker cron polls active partners every 5 min, pushes status back via PUT callbacks
- **Two pricing engines** — bidirectional zone-rate matrix and a physics-based cost model
- **COD reconciliation**, failed-delivery reasons, SLA fields, priority flags
- **Multi-branch RBAC** — first sign-in becomes super-admin, others default to rider
- **CSV import/export**, filters, search, cursor pagination
- **Optimistic-concurrency writes** via `version` column
- **Zero-trust auth** — Cloudflare Access handles login; nothing to build or maintain
- **Public tracker** — signed JWT link works via customer subdomain without auth

## Quick start

```bash
git clone https://github.com/danieltekyi/pullup.git
cd pullup
npm install
npm run shared:build

# Local dev
npm run api:dev        # http://localhost:8787 (Miniflare + local D1)
npm run frontend:dev   # http://localhost:5173

# Deploy — see docs/CLOUDFLARE_PAGES.md
```

## Three-site build

The `apps/frontend` codebase compiles into three separate builds:

| Site | Domain | Mode |
| --- | --- | --- |
| Admin console | `pullup.aegisassetllc.com` | `VITE_APP_MODE=admin` |
| Rider PWA | `pulluprider.aegisassetllc.com` | `VITE_APP_MODE=rider` |
| Public customer | `pullupcustomer.aegisassetllc.com` | `VITE_APP_MODE=customer` |

Each build only ships the code that audience needs.

## Testing

```bash
npm test
npm run typecheck
npm run lint
```

## Documentation

- [docs/CLOUDFLARE_PAGES.md](docs/CLOUDFLARE_PAGES.md) — end-to-end deploy
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it fits together
- [SECURITY.md](SECURITY.md) — controls in place
- [apps/api/README.md](apps/api/README.md) — API dev + deploy
- [apps/frontend/README.md](apps/frontend/README.md) — frontend dev + build

## License

MIT — see [LICENSE](LICENSE).
