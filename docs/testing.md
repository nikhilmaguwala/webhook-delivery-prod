# Testing

## Commands

```bash
pnpm test:unit          # Fast unit tests (no database required)
pnpm test:integration   # API integration tests (requires Postgres)
pnpm test               # All tests
pnpm lint
pnpm typecheck
```

## Unit tests

Unit tests live in:

- `packages/shared/src/__tests__/` — backoff, HMAC signing, API-key hashing, password hashing
- `apps/api/src/__tests__/unit/` — JWT auth, ingest validation, endpoint health transitions

Run anywhere without external services:

```bash
pnpm test:unit
```

## Integration tests

Integration tests live in `apps/api/src/__tests__/integration/` and require a dedicated Postgres database.

Set `TEST_DATABASE_URL` before running:

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webhook_test
pnpm test:integration
```

### CI

GitHub Actions runs integration tests against a `postgres:17` service container. Unit tests and lint/typecheck run in a separate job.

### Coverage

| Area | Tests |
|------|-------|
| Event ingestion | ingest integration |
| Idempotency | ingest integration |
| Fan-out | ingest integration |
| Delivery success / retry / DLQ | delivery integration |
| Replay | delivery integration |
| Role-based access | authorization integration |

## Local Postgres (optional)

```bash
docker run -d --name webhook-test-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=webhook_test \
  -p 5432:5432 postgres:17

export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webhook_test
pnpm test:integration
```

Never point `TEST_DATABASE_URL` at production Neon or shared databases.

Integration tests call `TRUNCATE` on all tables. The test harness refuses hosted production URLs (including `*.neon.tech`) unless you explicitly set `ALLOW_REMOTE_TEST_DATABASE=true` — do not do this on production.
