import { events, deliveries, webhookEndpoints } from "@webhook-delivery/db";
import { MAX_RETRY_ATTEMPTS, type QueueMessage } from "@webhook-delivery/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../types";

const ingest = new Hono<AppEnv>();

ingest.post("/events", async (c) => {
  const projectId = c.get("projectId")!;
  const db = c.get("db");

  let body: {
    event_type?: string;
    payload?: Record<string, unknown>;
    idempotency_key?: string;
    metadata?: Record<string, unknown>;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.event_type || typeof body.event_type !== "string") {
    return c.json({ error: "event_type is required" }, 400);
  }

  if (!body.payload || typeof body.payload !== "object") {
    return c.json({ error: "payload is required and must be an object" }, 400);
  }

  if (body.idempotency_key) {
    const [existing] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, body.idempotency_key)))
      .limit(1);

    if (existing) {
      return c.json({ id: existing.id, status: "duplicate" }, 200);
    }
  }

  const [event] = await db
    .insert(events)
    .values({
      projectId,
      eventType: body.event_type,
      payload: body.payload,
      idempotencyKey: body.idempotency_key ?? null,
      metadata: body.metadata ?? null,
    })
    .returning({ id: events.id, createdAt: events.createdAt });

  const endpoints = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.enabled, true)));

  const deliveryRecords = await db
    .insert(deliveries)
    .values(
      endpoints.map((ep) => ({
        eventId: event.id,
        endpointId: ep.id,
        status: "pending" as const,
        maxAttempts: MAX_RETRY_ATTEMPTS,
      }))
    )
    .returning({ id: deliveries.id });

  for (const delivery of deliveryRecords) {
    await c.env.DELIVERY_QUEUE.send({
      deliveryId: delivery.id,
      attemptNumber: 1,
    } satisfies QueueMessage);
  }

  return c.json(
    {
      id: event.id,
      event_type: body.event_type,
      created_at: event.createdAt.toISOString(),
      deliveries_queued: deliveryRecords.length,
    },
    202
  );
});

export default ingest;
