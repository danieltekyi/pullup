# Secrets Rotation Log

Track all secret rotations here. Keep the running log; do not delete entries.

## Format

```
## YYYY-MM-DD — <secret name>
- What: brief description
- Why: reason (leaked, scheduled rotation, personnel change, etc.)
- Who: person who rotated
- Ticket / commit: link
```

---

## 2026-07-14 — Migration from v1 (`pullapp`) to v2 (`pullup`)

The following secrets were present in the v1 code archive and MUST be rotated **before** any production traffic hits the v2 stack:

| Secret | v1 location | Action required |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID` = `AKIAT26F7WYBZHTYNFSW` | v1 `backend/.env` | **Deactivate + delete in IAM** — never used by v2 (CDK uses roles + OIDC) |
| `AWS_SECRET_ACCESS_KEY` (paired above) | v1 `backend/.env` | Delete with the access key |
| `SMTP_PASS` = `ewhi bvvh tgls cjkc` (Gmail app password for `asamoahtekyi@gmail.com`) | v1 `backend/.env` | **Revoke in Google Account → App Passwords**; generate a new one and store in `pullup-prod/app-secrets` (Secrets Manager) |
| `TRACKER_LINK_SECRET` = `k9x2mP7qR4nL8vJ3wE6tY1uA5sD0fG` (30 chars) | v1 `backend/.env` | v2 CDK auto-generates a 64-char secret in Secrets Manager; the v1 secret can be discarded |

Any tracker links minted against the v1 secret **will not validate** against v2, which is intentional.

## How to rotate on v2

1. Open AWS Secrets Manager → `pullup-{env}/app-secrets`
2. Replace the value under the appropriate JSON key
3. If the change affects Lambda env vars, force a new deployment (`aws lambda update-function-configuration`) to pick up the new secret version — or wait ≤ 5 min for the Lambda cold-start
4. Add an entry below

---
