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
              events + deliveries      async workers              rate limits
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
| **Debugging webhooks** | Inspect payloads, response codes, latency, and **replay** failed deliveries from the dashboard |
| **Team access** | Invite teammates to a **project** (not a whole org) with Admin or Member roles |
| **Security** | HMAC-SHA256 on every delivery; API keys scoped per project; signing secrets per endpoint |

### What you get out of the box

- **Retries** with exponential backoff (up to 5 attempts)
- **Dead-letter queue** for permanently failed deliveries
- **Idempotency keys** to prevent duplicate events
- **Endpoint health** — healthy / degraded / unhealthy / disabled
- **Analytics** — success rate, avg response time, daily breakdown
- **Audit logs** — who changed what
- **Email OTP** on project invites (Brevo) so only the invited email can join

---

## Quick start (5 minutes)

### 1. Create an account

1. Open the [dashboard](https://webhook-master-nikhil.vercel.app/register)
2. Register with **email + password** (no Google/GitHub)
3. Create a **project** (e.g. “Production webhooks”)

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
  -d '{
    "event_type": "order.created",
    "payload": { "order_id": "ord_123", "amount": 4999 },
    "idempotency_key": "order-123-created"
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

### 5. Watch deliveries

Dashboard → **Deliveries** — see status, attempts, response time. Click **Inspect** or **Replay** if needed.

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
| None | — | Public invite preview + OTP |

### Endpoints

#### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | API status |

#### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/auth/register` | — | Create account `{ email, password, name }` |
| `POST` | `/v1/auth/login` | — | Sign in `{ email, password }` → JWT |
| `GET` | `/v1/auth/me` | JWT | Current user + organizations |

#### Ingest (API key)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/ingest/events` | API key | Publish event `{ event_type, payload, idempotency_key? }` |

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
| `GET` | `/v1/projects/:id/events` | Ingested events |
| `GET` | `/v1/projects/:id/deliveries` | Delivery list |
| `GET` | `/v1/deliveries/:id` | Delivery detail |
| `POST` | `/v1/deliveries/:id/replay` | Re-queue delivery |
| `GET` | `/v1/projects/:id/analytics` | Stats `?days=7` |
| `GET` | `/v1/organizations/:orgId/audit-logs` | Audit trail |

### Outbound webhook headers

Every delivery to your endpoint includes:

| Header | Description |
|--------|-------------|
| `X-Webhook-Id` | Event UUID |
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

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Dashboard | Next.js 15 on Vercel |
| API + queue worker | Cloudflare Workers + Queues |
| Database | Neon PostgreSQL + Drizzle ORM |
| Rate limiting + OTP cache | Upstash Redis |
| Email (invite OTP) | Brevo REST API |

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

### Deploy

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
| `BREVO_API_KEY` | Invite OTP emails |
| `BREVO_SENDER_EMAIL` | From address |
| `BREVO_SENDER_NAME` | From name |

---

## Project structure

```
webhook-delivery-prod/
├── apps/
│   ├── api/                 # Cloudflare Worker (REST + queue consumer)
│   │   └── src/routes/      # auth, ingest, invitations, management
│   └── dashboard/           # Next.js UI (Stitch design system)
├── packages/
│   ├── db/                  # Schema + migrations
│   └── shared/              # Crypto, backoff, types
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

---

## License

MIT
