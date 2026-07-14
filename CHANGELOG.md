# Changelog

## [2.1.0] — 2026-07-14

Migrated the entire backend to Cloudflare-only. AWS is fully gone.

### Added
- `apps/api/` — Hono on Cloudflare Workers with D1 (SQLite), R2 (proof images), KV, and Cron for partner polling
- Cloudflare Access integration — zero-code auth via Google / OTP / GitHub
- `apps/frontend/src/pages/customer/` — public landing page with tracking lookup
- Three-mode frontend build (`VITE_APP_MODE=admin|rider|customer`)
- `.github/workflows/pages.yml` — deploys Worker + all three Pages sites on push to main
- `wrangler.toml` cron trigger for 5-minute partner polling
- MailChannels for free transactional email via Workers
- Web Push signing implemented with `jose` (no Node crypto dependency)

### Removed
- `apps/backend/` — all Express + Lambda code
- `infra/cdk/` — AWS CDK stacks
- `aws-amplify` from frontend
- All AWS Secrets, Cognito, DynamoDB, S3 references from docs

### Changed
- Auth flow: no more login form. Access handles it at the edge.
- API: RESTful → still RESTful, but Hono routes instead of Express
- Storage: DynamoDB Query → D1 SQL (real joins, indexes, cursor pagination)
- Presigned URLs → direct multipart upload to R2 (simpler)
- Cron: `setInterval` in Lambda → native `[triggers] crons` in wrangler.toml
- First-user bootstrap: first Access-authenticated user auto-becomes super-admin

## [2.0.0] — 2026-07-14

Initial v2 rewrite of the v1 (`pullapp`) codebase. See git history for details.
