# Security Policy

## Reporting a vulnerability

Email **security@pullup.app** with details. Please do not open public issues for security problems.

## Secure-by-default checklist

The v2 codebase enforces these baseline controls out of the box. If you fork or modify, keep them in place.

### Authentication
- Cognito JWTs are verified with **algorithm pinning** (`RS256`), **issuer**, and **audience** checks
- Token type (`token_use`) is explicitly validated (`id` vs `access`)
- Invalid tokens produce **401** — never treated as anonymous
- Password minimum length: **12 characters** with mixed case + digits
- MFA (TOTP) is **optional in dev**, **available in prod** (turn on `mfa: REQUIRED` in `auth-stack.ts` once your riders have authenticator apps)
- Advanced security mode is enabled in `AUDIT` on prod (detects credential stuffing)

### Authorization
- Every mutating route requires `requireAuth` — no silent-pass on unauthenticated tokens
- Rider-scoped routes verify the order is assigned to the caller (`order.assignedTo === user.riderId`)
- Manager-scoped routes verify the order belongs to their branch
- `getBranchFilter` fails **closed** (`__none__`) for users lacking a valid role — no accidental cross-branch reads

### Rate limiting
- `globalLimiter`: 200 requests / minute / IP
- `trackerLimiter`: 10 requests / minute / IP on `/api/tracker/*`
- `authLimiter`: 20 requests / 5 minutes / IP on `/api/users/me`
- WAF rate-based rule at 2000 requests / 5 minutes / IP as second line of defense

### Data
- All DynamoDB tables use **PITR** (point-in-time recovery) and **AWS-managed encryption**
- S3 proof-of-delivery bucket: **encryption**, **public access blocked**, **HTTPS-only**, **CORS scoped**
- Presigned uploads: MIME allow-list, size cap, **short 5-minute** validity
- Soft-delete via `deletedAt` — no data loss on accidental delete
- **Optimistic concurrency** via `version` field prevents lost updates

### Transport & network
- CloudFront enforces **HTTPS redirect** on the web bucket
- WAF attaches AWS Managed Common Rule Set on the CloudFront distribution
- API Gateway has CORS locked to specific origins in prod
- CORS preflight cached for 1 hour to reduce load

### Secrets
- `TRACKER_LINK_SECRET` and application secrets live in **AWS Secrets Manager** (see `api-stack.ts`)
- `.env` files are `.gitignore`d
- CI/CD uses **OIDC** to AWS — no long-lived access keys in GitHub Secrets
- Pino logger **redacts** `authorization`, `password`, `apiKey`, `token`, `secret` fields

### Application
- Input validation via **Zod** on every mutating route
- Structured error responses — no stack traces leak in prod
- Helmet middleware adds security headers
- CSRF is not applicable (JWT bearer, not cookie auth)

## Threat model summary

| Threat | Mitigation |
| --- | --- |
| Credential stuffing / brute force | Rate limits + Cognito advanced security + password policy |
| JWT forgery | RS256 signature verification + issuer + audience |
| Cross-tenant data access | Branch-scoped filters + fail-closed sentinels + per-route ownership checks |
| Enumeration via error messages | Cognito `preventUserExistenceErrors: true`, generic API responses |
| Free spam relay via tracker email | `requireAuth` on tracker routes + rate limiter |
| Lost data on accidental delete | Soft delete + PITR |
| Data race on order updates | Optimistic concurrency via `version` |
| Malicious upload | MIME allow-list + size cap + presigned URL scope |

## Data retention

- Proof-of-delivery bucket lifecycle: **30 days in dev**, **2 years in prod**
- CloudWatch logs: **1 month**
- Soft-deleted rows: retained indefinitely (add TTL if needed for GDPR)

## Reporting rotation history

See `SECRETS_ROTATION.md` for the running log of any credentials that had to be rotated.
