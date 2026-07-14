# Cloudflare Setup — end-to-end

The whole stack runs on Cloudflare: three Pages sites (admin / rider / customer)
+ one Worker (`pullup-api`) + D1 (SQLite) + R2 (proof-of-delivery images) +
Cloudflare Access (zero-trust auth).

Domain: `aegisassetllc.com` (already on Cloudflare — nameservers set).

## Endpoints

| URL | What |
| --- | --- |
| `pullup.aegisassetllc.com` | Admin console (Pages, behind Access) |
| `pulluprider.aegisassetllc.com` | Rider PWA (Pages, behind Access) |
| `pullupcustomer.aegisassetllc.com` | Public customer landing + tracking (Pages, public) |
| `api.aegisassetllc.com` | Workers API (D1 + R2, behind Access with public bypass for tracker) |

---

## 1. Create Cloudflare API token

Cloudflare dashboard → **My Profile** → **API Tokens** → **Create Token** →
**Custom token**:

- **Account permissions**
  - `Cloudflare Pages` → **Edit**
  - `Workers Scripts` → **Edit**
  - `Workers R2 Storage` → **Edit**
  - `D1` → **Edit**
  - `Workers KV Storage` → **Edit**
  - `Access: Apps and Policies` → **Edit**
- **Zone permissions** for `aegisassetllc.com`:
  - `Zone` → **Read**
  - `DNS` → **Edit**
  - `Workers Routes` → **Edit**

Copy the token; grab your **Account ID** from the right sidebar.

## 2. GitHub secrets

At https://github.com/danieltekyi/pullup/settings/secrets/actions:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | (from step 1) |
| `CLOUDFLARE_ACCOUNT_ID` | (from step 1) |
| `VITE_SENTRY_DSN` | optional |

That's it — no Cognito, no AWS.

## 3. Provision the D1 database, R2 bucket, KV namespace

Locally, once:

```bash
cd apps/api
npm install
npx wrangler login

# D1
npx wrangler d1 create pullup
# Note the `database_id` — paste into apps/api/wrangler.toml (replace PLACEHOLDER_D1_ID)

# R2
npx wrangler r2 bucket create pullup-proof

# KV
npx wrangler kv namespace create pullup-kv
# Paste the id into wrangler.toml (replace PLACEHOLDER_KV_ID)

# Apply schema + seed
npm run db:apply:remote

# Secrets
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" | npx wrangler secret put TRACKER_LINK_SECRET

# Optional integrations
echo "..." | npx wrangler secret put AT_USERNAME
echo "..." | npx wrangler secret put AT_API_KEY
echo "..." | npx wrangler secret put TWILIO_ACCOUNT_SID
echo "..." | npx wrangler secret put TWILIO_AUTH_TOKEN
echo "..." | npx wrangler secret put TWILIO_WHATSAPP_FROM

# For push notifications — generate once with `npx web-push generate-vapid-keys`
echo "<public>"  | npx wrangler secret put VAPID_PUBLIC_KEY
echo "<private>" | npx wrangler secret put VAPID_PRIVATE_KEY
echo "mailto:ops@aegisassetllc.com" | npx wrangler secret put VAPID_SUBJECT
```

Commit `wrangler.toml` with the real database_id and KV id (they're not secrets).

## 4. First deploy of the API Worker

```bash
cd apps/api
npx wrangler deploy
```

Then in Cloudflare dashboard → **Workers & Pages** → `pullup-api`
→ **Settings** → **Domains & Routes** → **Add** → **Custom domain**
→ `api.aegisassetllc.com`. TLS is auto-provisioned.

## 5. Set up Cloudflare Access (Zero Trust)

1. Cloudflare dashboard → **Zero Trust** → free plan (no payment required for < 50 users)
2. **Settings** → **Authentication** → add a login method:
   - **Google** (recommended if your team has Gmail / Google Workspace)
   - **One-time PIN** (fallback for riders without Google — sends email code)
   - **GitHub** (optional for devs)
3. **Access** → **Access Groups** → **Add a group**:
   - Name: `pullup-admins`, include: emails ending in `@aegisassetllc.com` (or specific emails)
   - Name: `pullup-riders`, include: rider email addresses
4. **Access** → **Applications** → **Add an application** → **Self-hosted**:

   **App 1 — Admin**
   - Application name: `PullUp Admin`
   - Session duration: `24 hours`
   - Application domain: `pullup.aegisassetllc.com`
   - Identity providers: your chosen ones
   - Policy: **Allow** — Include: `pullup-admins` group

   **App 2 — Rider**
   - Application name: `PullUp Rider`
   - Session duration: `30 days` (long-lived so mobile PWA doesn't re-auth constantly)
   - Application domain: `pulluprider.aegisassetllc.com`
   - Policy: **Allow** — Include: `pullup-riders` group

   **App 3 — API**
   - Application name: `PullUp API`
   - Session duration: `24 hours`
   - Application domain: `api.aegisassetllc.com`
   - **Add path rule** → Path: `/api/tracker/validate` → **Bypass** (public tracker validation)
   - **Add path rule** → Path: `/api/tracker/proxy` → **Bypass**
   - **Add path rule** → Path: `/health` → **Bypass**
   - Policy: **Allow** — Include: both `pullup-admins` and `pullup-riders`

5. For each application, copy the **Application Audience (AUD) Tag** from Overview → Application Info.
6. All three apps share the same AUD prefix — put your team domain and one AUD in `apps/api/wrangler.toml`:
   ```toml
   CF_ACCESS_TEAM_DOMAIN = "aegis.cloudflareaccess.com"   # your team subdomain
   CF_ACCESS_AUD         = "abcd1234..."                   # any one of the three
   ```
7. Re-deploy: `cd apps/api && npx wrangler deploy`

## 6. Create the three Pages projects

Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Direct upload**. Name each:
- `pullup-admin`
- `pullup-rider`
- `pullup-customer`

Just create them — don't upload anything. The GitHub Action pushes the builds.

## 7. Trigger the deploy

Push to `main`. The workflow at `.github/workflows/pages.yml`:
1. Deploys the API Worker
2. Builds all three frontends in parallel with the correct `VITE_APP_MODE`
3. Deploys each to its Pages project

Check https://github.com/danieltekyi/pullup/actions for progress.

## 8. Bind custom domains

For each Pages project → **Custom domains** → **Set up a custom domain**:
- `pullup-admin` → `pullup.aegisassetllc.com`
- `pullup-rider` → `pulluprider.aegisassetllc.com`
- `pullup-customer` → `pullupcustomer.aegisassetllc.com`

Cloudflare auto-creates the CNAME + TLS cert (about 60 seconds).

## 9. Verify

- Visit `pullupcustomer.aegisassetllc.com` — should load without any login (public landing page)
- Visit `pullup.aegisassetllc.com` — Cloudflare Access should show its sign-in page
- Sign in — you'll be redirected to the admin dashboard
- **First user to sign in becomes super-admin automatically** (see `apps/api/src/middleware/access.ts`); everyone else defaults to `rider` and must be promoted by the super-admin via the Users page

## 10. Promote riders / add managers

Sign in as super-admin → **Users** page → change any user's role. Or manually:

```bash
cd apps/api
npx wrangler d1 execute pullup --remote --command "UPDATE users SET role='rider', branch_id='default', rider_id='rdr_XXX' WHERE email='rider@example.com'"
```

## Cost estimate

For a small business (say < 1000 orders/day, 20 users):

| Service | Tier | Monthly cost |
| --- | --- | --- |
| Cloudflare Pages | Free | $0 |
| Workers (API) | Free tier: 100k requests/day | $0 (until you exceed) |
| D1 | Free tier: 5M reads, 100k writes/day, 5GB storage | $0 |
| R2 | Free tier: 10GB storage, 1M Class A ops | $0 |
| Access (Zero Trust) | Free ≤ 50 users | $0 |
| DNS + TLS + CDN | Free | $0 |
| **Total** | | **$0** |

Above the free tiers, Workers Paid ($5/mo) unlocks 10M requests/day and Cron Triggers more frequent than once per minute.

## Troubleshooting

- **"CF_ACCESS_AUD mismatch" in Worker logs** — check the AUD tag matches the one in the Access application overview.
- **Rider gets logged out constantly** — increase the Access session duration to 30 days for the rider app.
- **Push notifications don't work** — VAPID keys not set. Run `npx web-push generate-vapid-keys` and put both keys in Worker secrets.
- **Partner poll cron not firing** — check `[triggers] crons = ["*/5 * * * *"]` in `wrangler.toml` and that the Worker is deployed.
- **Customer subdomain shows login** — you accidentally added an Access app for `pullupcustomer.*`. Delete it — that subdomain must be public.
