# PullUp CDK Infrastructure

AWS resources for PullUp v2, defined as code.

## Stacks

- `pullup-{env}-data` — DynamoDB tables (14) with GSIs, PITR, encryption; S3 proof-of-delivery bucket
- `pullup-{env}-auth` — Cognito user pool with `super-admin` / `manager` / `rider` groups
- `pullup-{env}-api` — Lambda (packaged from `apps/backend`) + API Gateway HTTP API + Secrets Manager
- `pullup-{env}-web` — S3 + CloudFront + WAF for the React PWA

## First-time deploy

```bash
npm install
npm run build

# Bootstrap CDK once per account/region
npx cdk bootstrap aws://<ACCOUNT>/<REGION>

# Dev
npm run deploy:dev

# Prod
npm run deploy:prod
```

## Notes

- `deploy:prod` uses `--require-approval broadening` so IAM/network changes require confirmation
- All non-prod tables use `DESTROY` policy; prod uses `RETAIN`
- Secrets are auto-generated where possible; fill in `pullup-{env}/app-secrets` in AWS Console
