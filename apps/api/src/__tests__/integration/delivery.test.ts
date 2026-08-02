import {
  deadLetterQueue,
  deliveries,
  deliveryAttempts,
  events,
  webhookEndpoints,
} from "@webhook-delivery/db";
import { MAX_RETRY_ATTEMPTS } from "@webhook-delivery/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requestApp } from "../helpers/app";
import { closeTestDb, createTestDb, getTestDatabaseUrl, resetDatabase } from "../helpers/db";
import { createTestEnv, seedProjectFixture } from "../helpers/fixtures";
import { processDelivery } from "../../services/delivery";

const hasDatabase = Boolean(getTestDatabaseUrl());

describe.skipIf(!hasDatabase)("delivery integration", () => {
  const queueMessages: unknown[] = [];
  const env = createTestEnv(queueMessages);

  beforeAll(async () => {
    await createTestDb();
  });

  beforeEach(async () => {
    const db = await createTestDb();
    await resetDatabase(db);
    queueMessages.length = 0;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function createPendingDelivery(db: Awaited<ReturnType<typeof createTestDb>>) {
    const fixture = await seedProjectFixture(db);
    const [event] = await db
      .insert(events)
      .values({
        projectId: fixture.projectId,
        eventType: "user.created",
        payload: { user_id: "user_1" },
      })
      .returning();

    const [delivery] = await db
      .insert(deliveries)
      .values({
        eventId: event.id,
        endpointId: fixture.endpointIds[0],
        status: "pending",
        maxAttempts: MAX_RETRY_ATTEMPTS,
      })
      .returning();

    return { fixture, event, delivery };
  }

  it("delivers successfully to the endpoint", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.status).toBe("delivered");

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, delivery.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0].responseStatus).toBe(200);
    expect(attempts[0].responseBody).toBeNull();
    expect(attempts[0].requestHeaders).toMatchObject({
      "X-Webhook-Delivery-Id": delivery.id,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [endpoint] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, updated.endpointId));
    expect(endpoint.status).toBe("healthy");
    expect(endpoint.consecutiveFailures).toBe(0);
  });

  it("schedules a retry after HTTP 500", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 }))
    );

    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.status).toBe("pending");
    expect(updated.attemptCount).toBe(1);
    expect(updated.nextRetryAt).not.toBeNull();
    expect(queueMessages).toHaveLength(1);
  });

  it("retries after a timeout/network error", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network timeout");
      })
    );

    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.status).toBe("pending");
    expect(updated.lastError).toContain("network timeout");
    expect(queueMessages).toHaveLength(1);
  });

  it("fails permanently on non-retryable client errors", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );

    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.status).toBe("failed");
    expect(updated.lastResponseStatus).toBe(404);
    expect(updated.lastResponseBody).toBe("not found");
    expect(queueMessages).toHaveLength(0);
  });

  it("redacts sensitive data from stored failure response bodies", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "bad", api_key: "whk_live_secret" }), { status: 500 })
      )
    );

    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, delivery.id));

    expect(attempts[0].responseBody).toContain("[REDACTED]");
    expect(attempts[0].responseBody).not.toContain("whk_live_secret");
  });

  it("reports request timeouts using the shorter delivery timeout", async () => {
    vi.useFakeTimers();

    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          })
      )
    );

    const promise = processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.lastError).toContain("Request timed out after 10000ms");

    vi.useRealTimers();
  });

  it("claims deliveries atomically to avoid duplicate HTTP attempts", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db),
      processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.deliveryId, delivery.id));
    expect(attempts).toHaveLength(1);
  });

  it("ignores stale queue messages for already-processed attempts", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    const fetchMock = vi.fn(async () => new Response("error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);
    await processDelivery({ deliveryId: delivery.id, attemptNumber: 1 }, env, db);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dead-letters after maximum attempts", async () => {
    const db = await createTestDb();
    const { delivery } = await createPendingDelivery(db);

    await db
      .update(deliveries)
      .set({ attemptCount: MAX_RETRY_ATTEMPTS - 1, status: "pending" })
      .where(eq(deliveries.id, delivery.id));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 }))
    );

    await processDelivery(
      { deliveryId: delivery.id, attemptNumber: MAX_RETRY_ATTEMPTS },
      env,
      db
    );

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.status).toBe("dead_lettered");

    const [dlq] = await db
      .select()
      .from(deadLetterQueue)
      .where(eq(deadLetterQueue.deliveryId, delivery.id));
    expect(dlq).toBeTruthy();
    expect(queueMessages).toHaveLength(0);
  });

  it("replays a delivery through the management API", async () => {
    const db = await createTestDb();
    const { fixture, delivery } = await createPendingDelivery(db);

    await db
      .update(deliveries)
      .set({ status: "dead_lettered", attemptCount: MAX_RETRY_ATTEMPTS })
      .where(eq(deliveries.id, delivery.id));

    const response = await requestApp(`/v1/deliveries/${delivery.id}/replay`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.admin.token}`,
        "Content-Type": "application/json",
      },
      env,
    });

    expect(response.status).toBe(200);
    expect(queueMessages).toHaveLength(1);

    const [updated] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    expect(updated.status).toBe("pending");
    expect(updated.isReplay).toBe(true);
    expect(updated.attemptCount).toBe(0);
  });
});
