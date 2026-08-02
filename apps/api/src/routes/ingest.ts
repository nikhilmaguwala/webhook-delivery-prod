import { Hono } from "hono";
import { parseIngestJson, validateIngestBody } from "@webhook-delivery/shared";
import { ingestEvent, resolveIdempotencyKey } from "../lib/ingest-event";
import type { AppEnv } from "../types";

const ingest = new Hono<AppEnv>();

ingest.post("/events", async (c) => {
  const projectId = c.get("projectId")!;
  const db = c.get("db");

  const rawText = await c.req.text();
  const parsed = parseIngestJson(rawText);
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, parsed.status);
  }

  const validation = validateIngestBody(parsed.body, { bodyBytes: parsed.bodyBytes });
  if (!validation.ok) {
    return c.json({ error: validation.error }, validation.status);
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
