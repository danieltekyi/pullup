# PullUp Backend

Express + Lambda API. Hardened Cognito, DynamoDB, S3, Secrets Manager.

## Local dev

```bash
cp .env.example .env
# Fill in COGNITO_USER_POOL_ID + COGNITO_APP_CLIENT_ID from `cdk deploy --all` outputs

npm run dev  # http://localhost:3000
```

## Test

```bash
npm test
```

## Structure

```
src/
├── config/env.ts       Zod-validated environment
├── lib/                logger, errors, validation, DDB client
├── middleware/         auth, branchScope, rateLimit, errorHandler
├── data/               DynamoDB repositories (Query-based, GSI-aware)
├── services/           partners, tracker, notifications, storage
├── routes/             HTTP routes (Zod-validated)
├── server.ts           Express app assembly
├── handler.ts          Lambda entrypoint (serverless-http)
└── local.ts            Local dev entrypoint
```

## Adding a route

1. Create `src/routes/<name>.ts` following the pattern in `orders.ts`
2. Mount in `server.ts`
3. Add tests in `test/`
4. Update permissions in `packages/shared/src/permissions.ts` if needed

## Deploy

Handled by CDK — see `../../infra/cdk/README.md`.
