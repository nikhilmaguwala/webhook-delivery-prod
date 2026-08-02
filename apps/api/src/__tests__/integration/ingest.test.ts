import { deliveries, events } from "@webhook-delivery/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requestApp } from "../helpers/app";
import { closeTestDb, createTestDb, getTestDatabaseUrl, resetDatabase } from "../helpers/db";
import {
  createTestEnv,
  getDeliveryCountForEvent,
  getEventByIdempotencyKey,
  seedProjectFixture,
} from "../helpers/fixtures";

const hasDatabase = Boolean(getTestDatabaseUrl());

describe.skipIf(!hasDatabase)("ingest integration", () => {
  const queueMessages: unknown[] = [];
  const env = createTestEnv(queueMessages);

  beforeAll(async () => {
    await createTestDb();
  });

  beforeEach(async () => {
    const db = await createTestDb();
    await resetDatabase(db);
    queueMessages.length = 0;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("ingests an event and fans out to all enabled endpoints", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "invoice.paid",
        payload: { invoice_id: "inv_123", amount: 9900 },
      }),
      env,
    });

    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      id: string;
      event_type: string;
      deliveries_queued: number;
    };
    expect(body.event_type).toBe("invoice.paid");
    expect(body.deliveries_queued).toBe(2);
    expect(queueMessages).toHaveLength(2);

    const deliveryCount = await getDeliveryCountForEvent(db, body.id);
    expect(deliveryCount).toBe(2);
  });

  it("returns the existing event for duplicate idempotency keys", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const payload = {
      event_type: "subscription.renewed",
      payload: { subscription_id: "sub_123" },
      idempotency_key: "idem-duplicate-001",
    };

    const first = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      env,
    });
    const firstBody = (await first.json()) as { id: string };

    const second = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      env,
    });
    const secondBody = (await second.json()) as { id: string; status: string };

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(secondBody).toEqual({ id: firstBody.id, status: "duplicate" });

    const eventsForKey = await db
      .select()
      .from(events)
      .where(eq(events.idempotencyKey, "idem-duplicate-001"));
    expect(eventsForKey).toHaveLength(1);
    expect(queueMessages).toHaveLength(2);
  });

  it("accepts idempotency keys from the Idempotency-Key header", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const first = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "header-idem-001",
      },
      body: JSON.stringify({
        event_type: "invoice.created",
        payload: { invoice_id: "inv_header" },
      }),
      env,
    });

    const second = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "header-idem-001",
      },
      body: JSON.stringify({
        event_type: "invoice.created",
        payload: { invoice_id: "inv_header" },
      }),
      env,
    });

    const firstBody = (await first.json()) as { id: string };
    const secondBody = (await second.json()) as { id: string; status: string };

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(secondBody).toEqual({ id: firstBody.id, status: "duplicate" });

    const event = await getEventByIdempotencyKey(db, fixture.projectId, "header-idem-001");
    expect(event).toBeTruthy();
    expect(queueMessages).toHaveLength(2);
  });

  it("does not enqueue duplicate deliveries for conflicting idempotency inserts", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const payload = {
      event_type: "payment.captured",
      payload: { payment_id: "pay_1" },
      idempotency_key: "idem-race-001",
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        requestApp("/v1/ingest/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${fixture.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          env,
        })
      )
    );

    const bodies = await Promise.all(responses.map((response) => response.json()));
    const created = responses.filter((response) => response.status === 202);
    const duplicates = responses.filter((response) => response.status === 200);

    expect(created).toHaveLength(1);
    expect(duplicates).toHaveLength(4);
    expect(new Set(bodies.map((body) => (body as { id: string }).id)).size).toBe(1);
    expect(queueMessages).toHaveLength(2);

    const eventsForKey = await db
      .select()
      .from(events)
      .where(eq(events.idempotencyKey, "idem-race-001"));
    expect(eventsForKey).toHaveLength(1);

    const deliveryCount = await getDeliveryCountForEvent(db, eventsForKey[0].id);
    expect(deliveryCount).toBe(2);
  });

  it("rejects invalid payloads", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: { missing: "event_type" } }),
      env,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("event_type");
  });

  it("rejects invalid event type formats", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);

    const response = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "invalid type!", payload: { ok: true } }),
      env,
    });

    expect(response.status).toBe(400);
  });

  it("rejects oversized request bodies with 413", async () => {
    const db = await createTestDb();
    const fixture = await seedProjectFixture(db);
    const hugePayload = JSON.stringify({
      event_type: "test.event",
      payload: { data: "x".repeat(300_000) },
    });

    const response = await requestApp("/v1/ingest/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.apiKey}`,
        "Content-Type": "application/json",
      },
      body: hugePayload,
      env,
    });

    expect(response.status).toBe(413);
  });
});
