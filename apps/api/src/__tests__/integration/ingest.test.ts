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
    expect(await response.json()).toEqual({ error: "event_type is required" });
  });
});
