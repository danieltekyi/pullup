# PullUp Frontend

Premium React + TypeScript PWA for the PullUp delivery platform.

## Development

```bash
cp .env.example .env  # fill in Cognito + API URL
npm install
npm run dev
```

Open http://localhost:5173.

## Test

```bash
npm run test
```

## Build

```bash
npm run build
npm run preview
```

## Deploy

Frontend is deployed to S3 + CloudFront by the CDK stack in `../../infra/cdk`.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).
