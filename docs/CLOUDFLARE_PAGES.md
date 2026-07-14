# Cloudflare Pages Deployment — Step-by-Step

You'll deploy three sites from **one** GitHub repo to **three** Cloudflare Pages
projects, each on its own subdomain of `aegisassetllc.com`:

| Subdomain | Project | Audience | Auth required? |
| --- | --- | --- | --- |
| `pullup.aegisassetllc.com` | `pullup-admin` | Managers + super-admins | Yes (Cognito) |
| `pulluprider.aegisassetllc.com` | `pullup-rider` | Riders (mobile PWA) | Yes (Cognito) |
| `pullupcustomer.aegisassetllc.com` | `pullup-customer` | Public customers | No |
| `api.aegisassetllc.com` | (CNAME to AWS API Gateway) | Backend API | — |

---

## One-time setup

### 1. Move the domain to Cloudflare (or ensure it's already there)

1. Open the Cloudflare dashboard → **Add a Site** → enter `aegisassetllc.com`
2. Cloudflare will scan existing DNS records — verify nothing is lost
3. At your **current DNS registrar**, change the nameservers to the two shown by Cloudflare (they look like `xxx.ns.cloudflare.com`)
4. Wait for Cloudflare to say "Active" — typically 5 min to a few hours

If you already have the domain on Cloudflare, skip to step 2.

### 2. Create a Cloudflare API token

Dashboard → **My Profile** → **API Tokens** → **Create Token** → **Custom token** with:

- **Permissions**
  - `Account` — `Cloudflare Pages` — `Edit`
  - `Zone` — `Zone` — `Read`
  - `Zone` — `DNS` — `Edit`
- **Zone Resources** — `Include` — `Specific zone` — `aegisassetllc.com`
- **Account Resources** — `Include` — your account
- **TTL** — no expiry (or 1 year, up to you)

Copy the token immediately — Cloudflare shows it once.

Also grab your **Account ID** from the right sidebar of any Cloudflare page.

### 3. Add GitHub secrets

Go to https://github.com/danieltekyi/pullup/settings/secrets/actions and add:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account ID |
| `VITE_API_URL` | `https://api.aegisassetllc.com` (or the API Gateway URL if you haven't set up the CNAME yet) |
| `VITE_COGNITO_REGION` | e.g. `us-east-1` |
| `VITE_COGNITO_USER_POOL_ID` | from `cdk deploy --all` output |
| `VITE_COGNITO_APP_CLIENT_ID` | from `cdk deploy --all` output |
| `VITE_SENTRY_DSN` | optional |

### 4. Create the three Pages projects

For each of `pullup-admin`, `pullup-rider`, `pullup-customer`:

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Direct upload** (we're using GitHub Actions for the actual deploy, not Cloudflare's built-in Git integration — that gives us the split-build behavior)
2. Name: `pullup-admin` (or `pullup-rider` / `pullup-customer`)
3. Click **Create**, then close — the first real deploy will populate it.

### 5. First deploy

Push any commit to `main`:

```bash
git commit --allow-empty -m "chore: trigger initial pages deploy"
git push
```

Watch the **Deploy to Cloudflare Pages** workflow in the GitHub Actions tab.
When all three matrix jobs go green, your sites are live on the default
`*.pages.dev` domains, e.g. `pullup-admin.pages.dev`.

### 6. Bind the custom subdomains

In Cloudflare dashboard, for each Pages project:

1. Project → **Custom domains** → **Set up a custom domain**
2. Enter the domain:
   - `pullup-admin` → `pullup.aegisassetllc.com`
   - `pullup-rider` → `pulluprider.aegisassetllc.com`
   - `pullup-customer` → `pullupcustomer.aegisassetllc.com`
3. Cloudflare auto-creates the CNAME and provisions a TLS cert

Done. Each subdomain will be live within ~1 minute.

### 7. Point `api.aegisassetllc.com` at AWS API Gateway

In Cloudflare dashboard → **DNS** → **Records**:

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| `CNAME` | `api` | `<api-id>.execute-api.us-east-1.amazonaws.com` | ❌ **DNS only** (grey cloud) |

**Do not** proxy the API through Cloudflare (orange cloud) unless you're on a paid plan that supports mTLS pass-through, because API Gateway rejects non-matching Host headers. Grey cloud gives you a friendly domain without breaking the AWS certificate.

**Better option** (recommended for prod): configure a custom domain on API Gateway itself using AWS ACM cert, then CNAME to the API Gateway custom domain — you'll get end-to-end TLS with Cloudflare proxying enabled.

### 8. Update backend CORS

Edit `apps/backend/.env` (or the equivalent Lambda env var) and set:

```
ALLOWED_ORIGINS=https://pullup.aegisassetllc.com,https://pulluprider.aegisassetllc.com,https://pullupcustomer.aegisassetllc.com
```

Redeploy the backend Lambda.

---

## After setup — every push to main

1. GitHub Action runs `pages.yml`
2. Builds all three modes in parallel
3. Deploys each to its Cloudflare Pages project
4. Subdomains update automatically — no DNS changes needed after the initial setup

## Troubleshooting

**Build fails with "VITE_APP_MODE is not defined"** — the `cross-env` binding is missing. `npm install` after the latest package.json.

**Custom domain says "Verifying" for > 10 minutes** — check that Cloudflare is authoritative DNS for the domain (nameservers). If DNS hasn't propagated, verification stalls.

**Rider app shows admin login page** — the build didn't get `VITE_APP_MODE=rider`. Check the GitHub Actions log for that matrix job.

**CORS errors from the frontend** — backend `ALLOWED_ORIGINS` env var is missing the new subdomains. Redeploy the backend Lambda after updating.

**Service worker keeps serving old version** — Cloudflare Pages sets `_headers` to no-cache for `sw.js`, so users should get updates within 1 request cycle. If not, hard-refresh (Ctrl+Shift+R).

## Cost

Cloudflare Pages free tier is generous: **500 builds/month**, unlimited requests, unlimited bandwidth. A single push triggers 3 builds (one per site), so ~166 pushes/month before you hit the paid tier ($20/mo for 5000 builds).
