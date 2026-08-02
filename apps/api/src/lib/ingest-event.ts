import { deliveries, events, webhookEndpoints } from "@webhook-delivery/db";
import type { Database } from "@webhook-delivery/db";
import { MAX_RETRY_ATTEMPTS, type QueueMessage } from "@webhook-delivery/shared";
import { and, eq } from "drizzle-orm";
import type { ValidatedIngestBody } from "./validate-ingest";

export type IngestEventResult =
  | {
      kind: "created";
      eventId: string;
      eventType: string;
      createdAt: Date;
      deliveriesQueued: number;
    }
  | {
      kind: "duplicate";
      eventId: string;
    };

type QueueSender = {
  send(message: QueueMessage, options?: { delaySeconds?: number }): Promise<unknown>;
};

export function resolveIdempotencyKey(
  bodyKey: string | undefined,
  headerKey: string | undefined
): string | undefined {
  const body = bodyKey?.trim();
  if (body) return body;

  const header = headerKey?.trim();
  if (header) return header;

  return undefined;
}

export async function ingestEvent(
  db: Database,
  projectId: string,
  body: ValidatedIngestBody,
  idempotencyKey: string | undefined,
  queue: QueueSender
): Promise<IngestEventResult> {
  if (idempotencyKey) {
    const inserted = await db
      .insert(events)
      .values({
        projectId,
        eventType: body.event_type,
        payload: body.payload,
        idempotencyKey,
        metadata: body.metadata ?? null,
      })
      .onConflictDoNothing({
        target: [events.projectId, events.idempotencyKey],
      })
      .returning({ id: events.id, createdAt: events.createdAt });

    if (inserted.length === 0) {
      const [existing] = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, idempotencyKey)))
        .limit(1);

      if (!existing) {
        throw new Error("Idempotency conflict without existing event");
      }

      return { kind: "duplicate", eventId: existing.id };
    }

    const event = inserted[0];
    const deliveriesQueued = await fanOutDeliveries(db, projectId, event.id, queue);

    return {
      kind: "created",
      eventId: event.id,
      eventType: body.event_type,
      createdAt: event.createdAt,
      deliveriesQueued,
    };
  }

  const [event] = await db
    .insert(events)
    .values({
      projectId,
      eventType: body.event_type,
      payload: body.payload,
      idempotencyKey: null,
      metadata: body.metadata ?? null,
    })
    .returning({ id: events.id, createdAt: events.createdAt });

  const deliveriesQueued = await fanOutDeliveries(db, projectId, event.id, queue);

  return {
    kind: "created",
    eventId: event.id,
    eventType: body.event_type,
    createdAt: event.createdAt,
    deliveriesQueued,
  };
}

async function fanOutDeliveries(
  db: Database,
  projectId: string,
  eventId: string,
  queue: QueueSender
): Promise<number> {
  const endpoints = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.projectId, projectId), eq(webhookEndpoints.enabled, true)));

  if (endpoints.length === 0) {
    return 0;
  }

  const deliveryRecords = await db
    .insert(deliveries)
    .values(
      endpoints.map((ep) => ({
        eventId,
        endpointId: ep.id,
        status: "pending" as const,
        maxAttempts: MAX_RETRY_ATTEMPTS,
      }))
    )
    .returning({ id: deliveries.id });

  for (const delivery of deliveryRecords) {
    await queue.send({
      deliveryId: delivery.id,
      attemptNumber: 1,
    } satisfies QueueMessage);
  }

  return deliveryRecords.length;
}
