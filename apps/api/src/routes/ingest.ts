import { Hono } from "hono";
import { ingestEvent, resolveIdempotencyKey } from "../lib/ingest-event";
import { validateIngestBody } from "../lib/validate-ingest";
import type { AppEnv } from "../types";

const ingest = new Hono<AppEnv>();

ingest.post("/events", async (c) => {
  const projectId = c.get("projectId")!;
  const db = c.get("db");

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const validation = validateIngestBody(rawBody);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }

  const body = validation.data;
  const idempotencyKey = resolveIdempotencyKey(
    body.idempotency_key,
    c.req.header("Idempotency-Key")
  );

  if (idempotencyKey && body.idempotency_key && c.req.header("Idempotency-Key")) {
    const headerKey = c.req.header("Idempotency-Key")!.trim();
    if (headerKey !== body.idempotency_key) {
      return c.json({ error: "Idempotency-Key header does not match body idempotency_key" }, 400);
    }
  }

  try {
    const result = await ingestEvent(db, projectId, body, idempotencyKey, c.env.DELIVERY_QUEUE);

    if (result.kind === "duplicate") {
      return c.json({ id: result.eventId, status: "duplicate" }, 200);
    }

    return c.json(
      {
        id: result.eventId,
        event_type: result.eventType,
        created_at: result.createdAt.toISOString(),
        deliveries_queued: result.deliveriesQueued,
      },
      202
    );
  } catch (error) {
    console.error("Ingest failed:", error);
    return c.json({ error: "Failed to ingest event" }, 500);
  }
});

export default ingest;
