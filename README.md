# Webhook Delivery

A production-ready platform for reliably delivering webhook events to your endpoints. Register webhook URLs, ingest events via API, and let the system handle delivery, retries, signing, and monitoring.

## How It Works

```
┌─────────────┐     POST /v1/ingest/events      ┌──────────────────┐
│  Your App   │ ──────────────────────────────► │  Cloudflare API  │
│  (Producer) │     Authorization: Bearer key   │  Worker          │
└─────────────┘                                 └────────┬─────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │  Neon PostgreSQL │
                                                │  (events,        │
                                                │   deliveries)    │
                                                └────────┬─────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │ Cloudflare Queue │
                                                │ (delivery jobs)  │
                                                └────────┬─────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │  Your Webhook    │
                                                │  Endpoint        │
                                                │  (POST + HMAC)   │
                                                └──────────────────┘
```

When you send an event:

1. The API validates your API key and checks rate limits (via Upstash Redis).
2. The event is stored in PostgreSQL with an optional idempotency key.
3. A delivery record is created for each enabled endpoint in the project.
4. Delivery jobs are pushed to Cloudflare Queues.
5. The queue consumer POSTs the payload to your endpoint with an HMAC-SHA256 signature.
6. Failed deliveries are retried with exponential backoff (up to 5 attempts).
7. Permanently failed deliveries move to the dead-letter queue.
8. All attempts, response times, and payloads are recorded for inspection.

## Features

| Feature | Description |
|---------|-------------|
| Organizations & Projects | Multi-tenant structure for teams and apps |
| API Keys | Per-project keys for event ingestion |
| Event Ingestion API | REST API to publish events |
| Background Delivery | Async delivery via Cloudflare Queues |
| HMAC Signatures | `X-Webhook-Signature: sha256=<hex>` on every delivery |
| Exponential Backoff | 1s → 2s → 4s → … up to 5 minutes between retries |
| Dead-Letter Queue | Failed deliveries after max retries are preserved |
| Idempotency Keys | Prevent duplicate events with `idempotency_key` |
| Delivery History | Full attempt log with request/response details |
| Response-Time Analytics | Per-endpoint and aggregate latency metrics |
| Manual Replay | Re-queue any delivery from the dashboard |
| Rate Limiting | 1,000 events/minute per project |
| Endpoint Health | healthy / degraded / unhealthy status tracking |
| Payload Inspection | View event payloads and delivery responses |
| Audit Logs | Track all management actions |

## Tech Stack

| Component | Service | Free Tier |
|-----------|---------|-----------|
| Dashboard | Next.js on Vercel | Hobby plan |
| API + Queue Consumer | Cloudflare Workers + Queues | 100k req/day, 10k queue ops/day |
| Database | Neon PostgreSQL | 0.5 GB storage |
| Rate Limiting | Upstash Redis | 10k commands/day |
| CI/CD | GitHub Actions | Free for public repos |

## Project Structure

```
webhook-delivery-prod/
├── apps/
│   ├── api/              # Cloudflare Worker (API + queue consumer)
│   └── dashboard/        # Next.js dashboard
├── packages/
│   ├── db/               # Drizzle ORM schema + migrations
│   └── shared/           # Shared utilities (crypto, backoff)
└── .github/workflows/    # CI/CD pipelines
```

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- pnpm 9+
- Accounts on [Cloudflare](https://dash.cloudflare.com), [Neon](https://neon.tech), and [Upstash](https://upstash.com)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Required variables:

| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `.env` + `.dev.vars` | Neon PostgreSQL connection string |
| `JWT_SECRET` | `.dev.vars` | Random 64-char string for dashboard sessions |
| `UPSTASH_REDIS_REST_URL` | `.dev.vars` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | `.dev.vars` | Upstash Redis REST token |
| `NEXT_PUBLIC_API_URL` | `.env` | API URL (`http://localhost:8787` locally) |

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Create Cloudflare Queues

```bash
cd apps/api
npx wrangler queues create webhook-delivery-queue
npx wrangler queues create webhook-delivery-dlq
```

### 5. Start the API

```bash
pnpm dev:api
```

The API runs at `http://localhost:8787`.

### 6. Start the dashboard

```bash
pnpm dev:dashboard
```

The dashboard runs at `http://localhost:3000`.

## API Reference

### Authentication

**Event ingestion** uses API keys:

```
Authorization: Bearer whk_live_<your-key>
```

**Dashboard/management** uses JWT tokens from login:

```
Authorization: Bearer <jwt-token>
```

### Ingest an Event

```bash
curl -X POST http://localhost:8787/v1/ingest/events \
  -H "Authorization: Bearer whk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "order.created",
    "payload": {
      "order_id": "ord_123",
      "amount": 4999
    },
    "idempotency_key": "order-123-created"
  }'
```

Response (`202 Accepted`):

```json
{
  "id": "uuid",
  "event_type": "order.created",
  "created_at": "2026-01-01T00:00:00.000Z",
  "deliveries_queued": 2
}
```

### Verify Webhook Signatures

Every delivery includes these headers:

| Header | Description |
|--------|-------------|
| `X-Webhook-Id` | Event UUID |
| `X-Webhook-Timestamp` | Unix timestamp |
| `X-Webhook-Signature` | `sha256=<hmac-hex>` |
| `X-Webhook-Attempt` | Attempt number (1-based) |

To verify:

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

The signing secret is shown once when you create an endpoint in the dashboard.

### Replay a Delivery

```bash
curl -X POST http://localhost:8787/v1/deliveries/{delivery_id}/replay \
  -H "Authorization: Bearer <jwt-token>"
```

## Deployment

### Cloudflare Workers (API)

1. Log in: `npx wrangler login`
2. Set secrets:
   ```bash
   cd apps/api
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put UPSTASH_REDIS_REST_URL
   npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
   ```
3. Create queues (if not done):
   ```bash
   npx wrangler queues create webhook-delivery-queue
   npx wrangler queues create webhook-delivery-dlq
   ```
4. Deploy: `npx wrangler deploy`

### Vercel (Dashboard)

1. Import the repo in [Vercel](https://vercel.com)
2. Set root directory to `apps/dashboard`
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-worker.workers.dev`
4. Deploy

### GitHub Actions (Automated)

Add these secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | Session signing secret |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `VERCEL_TOKEN` | Vercel deploy token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `NEXT_PUBLIC_API_URL` | Production API URL |

Pushes to `main` trigger automatic deployment via `.github/workflows/deploy.yml`.

## What You Need to Set Up (Access Checklist)

To get this running in production, create accounts and provide access for:

### 1. Neon (Database) — Done if you have `DATABASE_URL`

- [ ] Create a project at [neon.tech](https://neon.tech)
- [ ] Copy the connection string (pooled connection recommended)
- [ ] Run `pnpm db:migrate` to create tables

### 2. Cloudflare (API + Queues)

- [ ] Create account at [dash.cloudflare.com](https://dash.cloudflare.com)
- [ ] Enable Workers (free plan)
- [ ] Create two queues: `webhook-delivery-queue` and `webhook-delivery-dlq`
- [ ] Create API token: **My Profile → API Tokens → Create Token → Edit Cloudflare Workers**
- [ ] Share: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (found on Workers overview page)
- [ ] Run `wrangler login` locally, or add token to GitHub secrets

### 3. Upstash (Rate Limiting)

- [ ] Create account at [upstash.com](https://upstash.com)
- [ ] Create a Redis database (free tier, REST API enabled)
- [ ] Share: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### 4. Vercel (Dashboard)

- [ ] Create account at [vercel.com](https://vercel.com)
- [ ] Import this GitHub repo, set root to `apps/dashboard`
- [ ] Share: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- [ ] Set `NEXT_PUBLIC_API_URL` to your Cloudflare Worker URL

### 5. GitHub (CI/CD)

- [ ] Push this repo to GitHub
- [ ] Add all secrets listed in the Deployment section
- [ ] Enable GitHub Actions

### 6. Generate Secrets

```bash
# JWT secret
openssl rand -hex 32
```

## Retry Policy

| Attempt | Base Delay | With Jitter |
|---------|-----------|-------------|
| 1 | Immediate | — |
| 2 | 1s | ~1–1.3s |
| 3 | 2s | ~2–2.6s |
| 4 | 4s | ~4–5.2s |
| 5 | 8s | ~8–10.4s |

After 5 failed attempts, the delivery is moved to the dead-letter queue. Endpoints are marked **degraded** after 3 consecutive failures and **unhealthy** after 10.

## Endpoint Health States

| Status | Condition |
|--------|-----------|
| `healthy` | Recent successful delivery |
| `degraded` | 3+ consecutive failures |
| `unhealthy` | 10+ consecutive failures |
| `disabled` | Manually disabled |

## License

MIT
