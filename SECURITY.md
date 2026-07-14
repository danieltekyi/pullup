# Security

## Reporting

Email **security@aegisassetllc.com**. Do not open public issues.

## Controls

**Auth (Cloudflare Access)**
- Every admin + rider + API subdomain is behind Access
- Login via Google / GitHub / one-time PIN (no passwords we manage)
- JWT verified by Worker: `RS256` + issuer (`<team>.cloudflareaccess.com`) + audience tag
- First sign-in becomes super-admin; everyone else defaults to `rider` until promoted

**Authorization**
- Rider-scoped writes: `order.assigned_to === user.rider_id`
- Branch-scoped reads/writes: `order.branch_id === user.branch_id` (super-admin bypass)
- `getBranchFilter` fails **closed** (`__none__`) for users with no branch

**Data**
- D1 auto-encrypted at rest
- R2 auto-encrypted at rest, HTTPS-only, blocked from public access
- Direct proof uploads: MIME allow-list + size cap
- Soft delete via `deleted_at`
- Optimistic concurrency via `version`

**Transport**
- HTTPS everywhere through Cloudflare CDN
- `secureHeaders` middleware
- CORS restricted to the three known Pages origins
- Free plan gets DDoS + bot protection; WAF is available on Pro

**Secrets**
- `TRACKER_LINK_SECRET` in Workers Secrets (`wrangler secret put`)
- All third-party API keys in Workers Secrets
- No `.env` files committed
- CI uses `CLOUDFLARE_API_TOKEN` in GitHub Secrets

## Threat model

| Threat | Mitigation |
| --- | --- |
| Credential stuffing | Cloudflare Access — we don't hold passwords |
| Cross-tenant leak | Branch-scoped queries with fail-closed defaults |
| Free tracker spam | `/api/tracker/generate` requires Access auth |
| Public order enumeration | Tracker links are signed JWTs (HS256, 1-hour default) |
| Race conditions on writes | Optimistic-concurrency version check |
| Lost data on delete | Soft delete + D1 point-in-time recovery (paid plan) |
| Malicious upload | MIME + size validation, direct R2 storage |
