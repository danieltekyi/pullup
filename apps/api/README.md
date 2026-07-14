# PullUp API — Cloudflare Workers + D1

Hono on Workers. D1 for storage. R2 for proof-of-delivery uploads.
Cloudflare Access for auth (no Cognito, no passwords).

## First-time setup

```bash
# 1. Install deps at repo root
npm install
npm run shared:build

# 2. Create D1 database
cd apps/api
npx wrangler login
npx wrangler d1 create pullup
# Copy the `database_id` from the output into wrangler.toml (PLACEHOLDER_D1_ID)

# 3. Create R2 bucket
npx wrangler r2 bucket create pullup-proof

# 4. Create KV namespace
npx wrangler kv namespace create pullup-kv
# Copy the id into wrangler.toml (PLACEHOLDER_KV_ID)

# 5. Apply schema + seed
npm run db:apply:remote

# 6. Set secrets
echo "<64-char-random>" | npx wrangler secret put TRACKER_LINK_SECRET

# Optional
echo "..." | npx wrangler secret put AT_USERNAME
echo "..." | npx wrangler secret put AT_API_KEY
echo "..." | npx wrangler secret put TWILIO_ACCOUNT_SID
echo "..." | npx wrangler secret put TWILIO_AUTH_TOKEN
echo "..." | npx wrangler secret put TWILIO_WHATSAPP_FROM
echo "..." | npx wrangler secret put VAPID_PUBLIC_KEY
echo "..." | npx wrangler secret put VAPID_PRIVATE_KEY
```

## Deploy

```bash
npm run deploy
```

## Bind custom domain

After first deploy, Cloudflare dashboard → **Workers & Pages** → `pullup-api`
→ **Custom Domains** → **Set up a custom domain** → `api.aegisassetllc.com`.

## Local dev

```bash
npm run dev             # Miniflare local Worker + local D1
```

Local D1 uses SQLite files under `.wrangler/state/`. Apply migrations first:

```bash
npm run db:apply:local
```

## Notes

- `nodejs_compat` compatibility flag is on — required by `jose` (JWT lib)
- Cron `*/5 * * * *` polls active partners every 5 minutes
- Bindings: `DB` (D1), `PROOF_BUCKET` (R2), `KV` (Workers KV)
- `Cf-Access-Jwt-Assertion` header is added by Cloudflare Access on every proxied request
