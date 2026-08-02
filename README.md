# Webhook Delivery

**Reliable webhook delivery for your apps** — ingest events once, deliver them to your endpoints with retries, HMAC signing, and full visibility in a dashboard.

| | URL |
|---|---|
| **Dashboard** | https://webhook-master-nikhil.vercel.app |
| **API** | https://webhook-delivery-api.nikhilkmaguwala.workers.dev |
| **Health check** | `GET /health` → `{"status":"ok"}` |

---

## What is this?

Webhook Delivery is a **managed webhook router**. Your application sends events to our API; we store them, sign each outbound request, deliver to your configured URLs, retry on failure, and show you exactly what happened.

Think of it as **“Postmark/Stripe webhooks infrastructure, but you own the stack.”**

```
Your App  →  POST /v1/ingest/events  →  Webhook Delivery API
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              PostgreSQL (Neon)        Cloudflare Queue           Upstash Redis
              events + deliveries      async workers              rate limits + OTP
                    │                         │
                    └─────────────┬───────────┘
                                  ▼
                         Your webhook endpoints
                         (POST + HMAC signature)
```

---

## Why is this useful?

| Use case | How Webhook Delivery helps |
|----------|---------------------------|
| **E‑commerce** | Emit `order.created`, `payment.succeeded` — deliver to fulfillment, analytics, CRM without building retry logic |
| **SaaS integrations** | Fan out one event to multiple customer webhook URLs per project |
| **Internal microservices** | Decouple services: producer doesn’t need to know endpoint URLs or handle failures |
| **Debugging webhooks** | Search, filter, sort, and paginate thousands of events/deliveries; inspect payloads; **replay** failures |
| **Team access** | Invite teammates to a **project** (not a whole org) with Admin or Member roles |
| **Security** | HMAC-SHA256 on every delivery; API keys scoped per project; signing secrets per endpoint |

### What you get out of the box

**Delivery pipeline**

- **Retries** with exponential backoff (up to 5 attempts)
- **Smart retry classification** — 4xx (except 408/429) are terminal; 5xx, timeouts, and network errors retry
- **Dead-letter queue** for permanently failed deliveries
- **Atomic delivery claims** — no duplicate concurrent workers on the same delivery (stale lock recovery after 120s)
- **10s delivery timeout** per outbound HTTP attempt
- **Response body retention** — 2xx responses store no body; error bodies are redacted and capped at 2 KB

**Ingestion & safety**

- **Idempotency keys** (body field or `Idempotency-Key` header) with DB-level deduplication
- **Zod validation** on ingest — 256 KB max body, payload depth/key limits, typed `event_type` + `payload`
- **SSRF protection** on endpoint URLs

**Dashboard & ops**

- **Paginated events & deliveries** — search, status filter, column sort, adjustable page size (10–100)
- **Endpoint health** — healthy / degraded / unhealthy / disabled
- **Analytics** — success rate, avg response time, daily breakdown
- **Audit logs** — who changed what
- **Email OTP** on project invites and password reset (Brevo)
- **Forgot password** — OTP verify flow from the dashboard login page

---

## Quick start (5 minutes)

### 1. Create an account

1. Open the [dashboard](https://webhook-master-nikhil.vercel.app/register)
2. Register with **email + password**
3. Create a **project** (e.g. “Production webhooks”)

Forgot your password? Use **Forgot password** on the login page → email OTP → set a new password.

### 2. Add an endpoint

1. Open your project → **Endpoints**
2. Paste your URL, e.g. `https://your-app.com/webhooks`
3. **Copy the signing secret** — shown once; use it to verify `X-Webhook-Signature` on your server

### 3. Create an API key

1. **API Keys** tab → Create key
2. Copy the key (`whk_live_...`)

### 4. Send an event

```bash
curl -X POST https://webhook-delivery-api.nikhilkmaguwala.workers.dev/v1/ingest/events \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-123-created" \
  -d '{
    "event_type": "order.created",
    "payload": { "order_id": "ord_123", "amount": 4999 }
  }'
```

Response (`202`):

```json
{
  "id": "uuid",
  "event_type": "order.created",
  "created_at": "2026-08-02T16:00:00.000Z",
  "deliveries_queued": 1
}
```

Re-sending with the same idempotency key returns the original event (no duplicate deliveries queued).

### 5. Watch deliveries

Dashboard → **Deliveries** — search by event type, endpoint, ID, or error; filter by status; sort columns; paginate through large histories. Click **Inspect** or **Replay** if needed.

Dashboard → **Events** — same search/sort/pagination for ingested events (including payload text search).

---

## Inviting teammates to a project

Access is **per project**, not org-wide.

| Role | Can do |
|------|--------|
| **Creator** | Full access; cannot be removed |
| **Admin** | Manage endpoints, keys, deliveries, invites, members |
| **Member** | View-only (no create/edit/replay/invite) |

### Invite flow

1. Project → **Members** → enter email + role → **Create invite link**
2. Send the link to your teammate
3. They open `/invite/{token}`:
   - **Verify** — 6-digit OTP emailed to the invited address
   - **Join** — create account (or sign in) and join the project

OTP is verified server-side; a signed `verification_token` is returned so the join step does not depend on fragile Redis type checks.

---

## API reference

Base URL: `https://webhook-delivery-api.nikhilkmaguwala.workers.dev`

### Auth types

| Type | Header | Used for |
|------|--------|----------|
| API key | `Authorization: Bearer whk_live_...` | Event ingestion |
| JWT | `Authorization: Bearer <jwt>` | Dashboard / management |
| None | — | Public invite preview + OTP, password reset |

### Endpoints

#### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | API status |

#### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/auth/register` | — | Create account `{ email, password, name }` |
| `POST` | `/v1/auth/login` | — | Sign in `{ email, password }` → JWT (case-insensitive email) |
| `GET` | `/v1/auth/me` | JWT | Current user + organizations |
| `POST` | `/v1/auth/forgot-password` | — | Send reset OTP `{ email, resend? }` |
| `POST` | `/v1/auth/verify-reset-otp` | — | Verify `{ email, otp }` → `reset_token` |
| `POST` | `/v1/auth/reset-password` | — | Set password `{ email, reset_token, password }` → JWT |

#### Ingest (API key)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/ingest/events` | API key | Publish event `{ event_type, payload, idempotency_key?, metadata? }` |

Optional header: `Idempotency-Key` (must match body `idempotency_key` if both are sent).

**Limits:** 256 KB request body; 128 KB payload; 16 KB metadata; max depth 12; max 200 JSON keys.

#### Invitations (public + JWT)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/v1/invitations/:token` | — | Preview invite |
| `POST` | `/v1/invitations/:token/send-otp` | — | Send OTP `{ resend?: boolean }` |
| `POST` | `/v1/invitations/:token/verify-otp` | — | Verify `{ otp }` → `verification_token` |
| `POST` | `/v1/invitations/:token/accept` | — | Join `{ name?, password?, verification_token }` |

#### Projects & team (JWT)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/projects` | List owned + shared projects |
| `GET` | `/v1/projects/:id/access` | Your role + permissions |
| `GET` | `/v1/projects/:id/members` | Members + pending invites |
| `POST` | `/v1/projects/:id/invitations` | Create invite `{ email, role }` |
| `PATCH` | `/v1/projects/:id/members/:userId` | Change role `{ role }` |
| `DELETE` | `/v1/projects/:id/members/:userId` | Remove access |
| `DELETE` | `/v1/projects/:id/invitations/:id` | Revoke pending invite |

#### Management (JWT)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/organizations/:orgId/projects` | Org projects |
| `POST` | `/v1/organizations/:orgId/projects` | Create project |
| `GET` | `/v1/projects/:id/endpoints` | List endpoints |
| `POST` | `/v1/projects/:id/endpoints` | Add endpoint `{ url }` |
| `PATCH` | `/v1/endpoints/:id` | Enable/disable `{ enabled }` |
| `GET` | `/v1/projects/:id/api-keys` | List API keys |
| `POST` | `/v1/projects/:id/api-keys` | Create key `{ name }` |
| `DELETE` | `/v1/api-keys/:id` | Revoke key |
| `GET` | `/v1/projects/:id/events` | Paginated events (see query params below) |
| `GET` | `/v1/projects/:id/deliveries` | Paginated deliveries (see query params below) |
| `GET` | `/v1/deliveries/:id` | Delivery detail + attempts |
| `POST` | `/v1/deliveries/:id/replay` | Re-queue delivery |
| `GET` | `/v1/projects/:id/analytics` | Stats `?days=7` |
| `GET` | `/v1/organizations/:orgId/audit-logs` | Audit trail |

#### List query params (`/events` and `/deliveries`)

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `1` | Page number (1-based) |
| `page_size` | `25` | Rows per page (max `100`) |
| `search` | — | Free-text search (see below) |
| `sort` | `created_at` | Column to sort by |
| `order` | `desc` | `asc` or `desc` |
| `status` | — | Deliveries only: `pending`, `delivering`, `delivered`, `failed`, `dead_lettered` |
| `event_type` | — | Filter by exact event type (case-insensitive) |

**Search fields**

- **Events:** event type, event ID, idempotency key, payload JSON text
- **Deliveries:** event type, endpoint URL, delivery ID, event ID, last error message

**Sortable columns**

- **Events:** `created_at`, `event_type`, `id`
- **Deliveries:** `created_at`, `status`, `event_type`, `attempt_count`, `last_response_status`, `last_response_time_ms`, `endpoint_url`

**Response shape:**

```json
{
  "events": [ /* or "deliveries" */ ],
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total": 1240,
    "total_pages": 50,
    "has_next": true,
    "has_prev": false
  },
  "filters": { "search": null, "sort": "created_at", "order": "desc" }
}
```

### Outbound webhook headers

Every delivery to your endpoint includes:

| Header | Description |
|--------|-------------|
| `X-Webhook-Id` | Event UUID |
| `X-Webhook-Delivery-Id` | Delivery UUID (unique per endpoint attempt chain) |
| `X-Webhook-Timestamp` | Unix timestamp |
| `X-Webhook-Signature` | `sha256=<hmac-hex>` |
| `X-Webhook-Attempt` | Attempt number (1-based) |

Verify on your server:

```javascript
const crypto = require("crypto");

function verifyWebhook(payload, timestamp, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return signature === `sha256=${expected}`;
}
```

---

## Example: full invite API flow

```bash
API="https://webhook-delivery-api.nikhilkmaguwala.workers.dev"
TOKEN="your-invite-token"

# 1. Preview invite
curl -s "$API/v1/invitations/$TOKEN"

# 2. Send OTP (first time)
curl -s -X POST "$API/v1/invitations/$TOKEN/send-otp" \
  -H "Content-Type: application/json" -d '{}'

# 3. Resend new OTP
curl -s -X POST "$API/v1/invitations/$TOKEN/send-otp" \
  -H "Content-Type: application/json" -d '{"resend":true}'

# 4. Verify OTP → save verification_token from response
curl -s -X POST "$API/v1/invitations/$TOKEN/verify-otp" \
  -H "Content-Type: application/json" -d '{"otp":"123456"}'

# 5. Accept invite (new user)
curl -s -X POST "$API/v1/invitations/$TOKEN/accept" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane",
    "password": "securepass123",
    "verification_token": "eyJ..."
  }'
```

### Example: paginated deliveries

```bash
JWT="your-dashboard-jwt"
PROJECT="project-uuid"

curl -s "$API/v1/projects/$PROJECT/deliveries?page=2&page_size=50&status=failed&search=timeout&sort=created_at&order=desc" \
  -H "Authorization: Bearer $JWT"
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Dashboard | Next.js 15 on Vercel |
| API + queue worker | Cloudflare Workers + Queues |
| Database | Neon PostgreSQL + Drizzle ORM |
| Rate limiting + OTP cache | Upstash Redis |
| Email (invite + password reset OTP) | Brevo REST API |

---

## Local development

```bash
pnpm install
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Fill DATABASE_URL, JWT_SECRET, UPSTASH_*, NEXT_PUBLIC_API_URL

pnpm db:migrate
pnpm dev:api      # http://localhost:8787
pnpm dev:dashboard # http://localhost:3000
```

### Tests

```bash
pnpm test                    # all packages
cd apps/api && pnpm test     # API unit + integration

# Integration tests require a local/dedicated TEST_DATABASE_URL —
# they refuse to run against hosted production Neon/Supabase URLs.
```

### Deploy

**Automatic (recommended):** Push to `main` → CI runs → on success, **Deploy & Release** deploys the API to Cloudflare and creates a GitHub Release (`v1.0.0-build.N`). The **dashboard** deploys automatically via **Vercel GitHub integration** (root directory: `apps/dashboard`).

**Manual API deploy:** Actions → **Deploy & Release** → **Run workflow**.

#### GitHub Actions secrets

Add these under **Settings → Secrets and variables → Actions** (API deploy only — dashboard is handled by Vercel):

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `DATABASE_URL` | Neon PostgreSQL |
| `JWT_SECRET` | Sessions + invite tokens |
| `UPSTASH_REDIS_REST_URL` | Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token |
| `BREVO_API_KEY` | Invite OTP emails |
| `BREVO_SENDER_EMAIL` | Email from address |
| `BREVO_SENDER_NAME` | Email from name |
| `NEXT_PUBLIC_API_URL` | Production API URL (for CI build + release notes) |
| `NEXT_PUBLIC_SITE_URL` | (optional) Dashboard URL for release notes |

#### Vercel environment variables

Set these in the Vercel dashboard for the `dashboard` project (Production, Preview, Development):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Production API URL |
| `NEXT_PUBLIC_SITE_URL` | Dashboard URL |

**Manual deploy (local):**

```bash
# API (Cloudflare)
cd apps/api && pnpm run deploy

# Dashboard (Vercel)
cd apps/dashboard && npx vercel --prod
```

### Required secrets (API worker)

| Secret | Purpose |
|--------|---------|
| `DATABASE_URL` | Neon PostgreSQL |
| `JWT_SECRET` | Sessions + invite verification tokens |
| `UPSTASH_REDIS_REST_URL` | Rate limits + OTP storage |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth |
| `BREVO_API_KEY` | Invite + password reset OTP emails |
| `BREVO_SENDER_EMAIL` | From address |
| `BREVO_SENDER_NAME` | From name |

---

## Project structure

```
webhook-delivery-prod/
├── apps/
│   ├── api/                 # Cloudflare Worker (REST + queue consumer)
│   │   └── src/
│   │       ├── routes/      # auth, ingest, invitations, management
│   │       └── lib/         # ingest-event, delivery-claim, list-query
│   └── dashboard/           # Next.js UI
│       └── src/components/  # PaginatedTable, Icon, CopyButton, …
├── packages/
│   ├── db/                  # Schema + migrations
│   └── shared/              # Crypto, backoff, retry classification, validation, limits
└── README.md
```

---

## Retry policy

| Attempt | Delay (with jitter) |
|---------|---------------------|
| 1 | Immediate |
| 2 | ~1s |
| 3 | ~2s |
| 4 | ~4s |
| 5 | ~8s |

After 5 failures → dead-letter queue. Endpoints: **degraded** at 3 consecutive failures, **unhealthy** at 10.

**Retry vs terminal:** HTTP **408**, **429**, and **5xx** are retried. Most **4xx** responses are terminal (no further retries). Network errors and timeouts are retried until max attempts.

---

## License

MIT
