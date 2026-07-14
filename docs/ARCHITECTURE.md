# Architecture

## System

```
┌────────────────────────────────────────────────────────────────────┐
│                         Client (PWA)                                │
│                                                                     │
│  Admin Console        Rider Mobile        Public /track            │
│  (React + Tailw)      (offline-first)     (no auth)                │
│         │                     │                     │              │
│         │                     └── IndexedDB queue ──┤              │
│         └── Cloudflare Access login (edge) ─────────┘              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTPS (Cloudflare CDN)
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Cloudflare (single vendor)                       │
│                                                                     │
│  Access ──▶ Worker (Hono) ──▶  D1 (SQLite, 14 tables + indexes)    │
│                       │                                             │
│                       ├──▶ R2 (proof-of-delivery images)           │
│                       ├──▶ KV (tracker cache, session bits)        │
│                       └──▶ Cron (*/5m partner poll)                │
│                                                                     │
│  Pages sites:                                                       │
│  ├─ pullup-admin     VITE_APP_MODE=admin                            │
│  ├─ pullup-rider     VITE_APP_MODE=rider                            │
│  └─ pullup-customer  VITE_APP_MODE=customer  (no auth)              │
└────────────────────────────────────────────────────────────────────┘
```

## Request flow — rider marks delivery

```
Rider taps "Delivered"
   │ (online)
POST /api/orders/{id}/status
   │
   ├── access.ts: verifies Cf-Access-Jwt-Assertion (RS256 + issuer + AUD)
   ├── loads/creates user from D1 (email is primary key)
   ├── Zod validation
   ├── scope: order.assigned_to === user.rider_id
   ├── UPDATE with optimistic-concurrency version check
   ├── INSERT into order_events (audit)
   ├── waitUntil: SMS the customer (Africa's Talking)
   └── 200 OK
   
   (offline)
enqueue → IndexedDB → on 'online' event → POST /api/sync {actions}
                                        → returns [{clientActionId, ok, reason}]
                                        → dequeue only ok=true
```

## Data model

Every entity: `id`, `created_at`, `updated_at`, `version`, `deleted_at?`.

- Optimistic concurrency via `version`
- Soft delete via `deleted_at`
- Audit via `order_events` (event-sourced)

## Auth

- **Cloudflare Access** wraps `pullup.*`, `pulluprider.*`, and `api.*` subdomains
- **Bypass rules** on API allow `/api/tracker/validate` + `/api/tracker/proxy` for the public customer app
- Access issues a JWT signed by the team's private key; JWKS at `<team>.cloudflareaccess.com/cdn-cgi/access/certs`
- Worker verifies signature + issuer + audience using `jose`
- Worker loads or bootstraps a user row in D1 keyed by email
- First user to sign in gets `super-admin`; everyone else defaults to `rider`

## Cron

- `*/5 * * * *` — poll every active partner GET endpoint and import new orders

Configured in `apps/api/wrangler.toml`.

## Trade-offs vs AWS

| Concern | AWS (previous) | Cloudflare (current) |
| --- | --- | --- |
| Auth | Cognito | Cloudflare Access (zero code) |
| Compute | Lambda + Express | Workers + Hono (10x faster cold start) |
| Storage | DynamoDB | D1 (SQLite — real joins!) |
| Files | S3 + presigned URLs | R2 + direct upload |
| Email | SES / SMTP | MailChannels (free) |
| Cost < 1000 orders/day | ~$5–20/mo | $0 |
| Compute limits | 15 min, 10 GB memory | 30s CPU, 128 MB memory |
| Ecosystem maturity | Enormous | Growing fast |
