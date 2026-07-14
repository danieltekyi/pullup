# Deployment

## Prerequisites

- **AWS account** with admin (or sufficient) IAM permissions
- **Node.js 20+**
- **AWS CLI** authenticated (`aws configure`) or federated credentials
- **CDK CLI** bootstrapped: `npx cdk bootstrap aws://<ACCOUNT>/<REGION>` (once per account)

## First deploy (dev)

```bash
# From repo root
npm install
npm run shared:build

# Provision infrastructure — creates all 4 stacks
cd infra/cdk
npm install
npm run build
npm run deploy:dev
```

After the stacks finish, capture the outputs (they're printed to stdout):

- `pullup-dev-auth.UserPoolId`
- `pullup-dev-auth.AppClientId`
- `pullup-dev-api.ApiUrl`
- `pullup-dev-web.BucketName`
- `pullup-dev-web.DistributionUrl`
- `pullup-dev-web.DistributionId`

## Configure the frontend for that stack

```bash
cat > apps/frontend/.env <<EOF
VITE_API_URL=https://<api-url>
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=<UserPoolId>
VITE_COGNITO_APP_CLIENT_ID=<AppClientId>
EOF
```

Build + push:

```bash
npm run frontend:build
aws s3 sync apps/frontend/dist s3://<BucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths '/*'
```

## Populate secrets

Open **AWS Secrets Manager** → `pullup-dev/app-secrets` and put the JSON:

```json
{
  "SMTP_HOST": "smtp.gmail.com",
  "SMTP_PORT": "465",
  "SMTP_USER": "you@example.com",
  "SMTP_PASS": "<gmail-app-password>",
  "FROM_EMAIL": "no-reply@pullup.app",
  "AT_USERNAME": "sandbox",
  "AT_API_KEY": "atsk_xxx",
  "TWILIO_ACCOUNT_SID": "ACxxx",
  "TWILIO_AUTH_TOKEN": "xxx",
  "TWILIO_WHATSAPP_FROM": "+14155551234",
  "VAPID_PUBLIC_KEY": "...",
  "VAPID_PRIVATE_KEY": "...",
  "GOOGLE_MAPS_API_KEY": "AIzaxxx"
}
```

Values with empty keys are safe — those features simply degrade to no-op.

Generate VAPID keys once (locally): `npx web-push generate-vapid-keys`.

## Create the first super-admin user

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username admin@pullup.app \
  --user-attributes Name=email,Value=admin@pullup.app Name=email_verified,Value=true \
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username admin@pullup.app \
  --password 'ChangeMe1234!' \
  --permanent

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username admin@pullup.app \
  --group-name super-admin
```

Sign in at the CloudFront URL. Once inside, use **Users** page to create managers and riders.

## Prod deploy

Same as above but with `--context env=prod`. The prod stack has `RETAIN` removal policy on all data resources — you cannot accidentally delete production tables.

## CI/CD

`.github/workflows/deploy.yml` runs on push to `main` and via workflow_dispatch. Required GitHub Secrets:

- `AWS_DEPLOY_ROLE_ARN` (OIDC-federated role — see setup below)
- `AWS_REGION`
- `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_APP_CLIENT_ID`
- `WEB_BUCKET`, `DISTRIBUTION_ID`

Create the OIDC role in AWS IAM with a trust policy scoped to `repo:Stekyi/pullup:*`. Full recipe: [github.com/aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials).

## Rollback

Frontend rollback is a re-sync of the previous S3 build. Lambda rollback is `aws lambda update-function-code --publish` back to a previous version. DynamoDB PITR gives you 35-day rollback for data.
