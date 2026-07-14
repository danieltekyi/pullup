# Contributing

## Local dev

```bash
npm install
npm run shared:build

cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
# Fill in Cognito + API URL

# Two terminals
npm run backend:dev
npm run frontend:dev
```

## Code standards

- **TypeScript strict mode** — no `any` unless truly necessary
- **Zod** for all API input validation
- **`asyncHandler`** wrapper around every async route
- **`HttpError`** subclasses for all error responses — never `res.status(500).send()`
- Never commit `.env` files, private keys, or hardcoded secrets

## Testing

```bash
npm test                 # all packages
npm run test --workspace=@pullup/backend --watch
```

## Commit style

Conventional-commits recommended:
- `feat: add COD reconciliation dashboard`
- `fix: correct rate limit key for anonymous requests`
- `chore: bump aws-cdk`
- `docs: expand rider onboarding guide`

## Opening PRs

1. Fork or branch (`feature/xxx`, `fix/xxx`)
2. Add tests for new logic
3. Run `npm run typecheck` + `npm run lint` + `npm test`
4. Fill in the PR template describing what and why
