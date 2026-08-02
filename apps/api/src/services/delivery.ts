import {
  deliveries,
  deliveryAttempts,
  deadLetterQueue,
  events,
  webhookEndpoints,
} from "@webhook-delivery/db";
import {
  calculateBackoff,
  classifyDeliveryFailure,
  executeWebhookFetch,
  prepareStoredResponseBody,
  sanitizeRequestHeaders,
  signPayload,
  type QueueMessage,
  type WebhookPayload,
} from "@webhook-delivery/shared";
import { createDb, type Database } from "@webhook-delivery/db";
import { eq } from "drizzle-orm";
import { claimDelivery } from "../lib/delivery-claim";
import { computeEndpointHealthStatus } from "../lib/endpoint-health";
import { isRedirectStatus, validateWebhookUrl } from "../lib/ssrf";
import type { Env } from "../types";

export async function processDelivery(
  message: QueueMessage,
  env: Env,
  dbOverride?: Database
): Promise<void> {
  const db = dbOverride ?? createDb(env.DATABASE_URL);

  const delivery = await claimDelivery(db, message.deliveryId, message.attemptNumber);
  if (!delivery) {
    return;
  }

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, delivery.eventId))
    .limit(1);

  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId))
    .limit(1);

  if (!event || !endpoint || !endpoint.enabled) {
    await db
      .update(deliveries)
      .set({ status: "failed", lastError: "Endpoint disabled or not found", updatedAt: new Date() })
      .where(eq(deliveries.id, delivery.id));
    return;
  }

  const attemptNumber = message.attemptNumber;
  const webhookPayload: WebhookPayload = {
    id: event.id,
    event_type: event.eventType,
    created_at: event.createdAt.toISOString(),
    payload: event.payload as Record<string, unknown>,
    metadata: (event.metadata as Record<string, unknown>) ?? undefined,
  };

  const body = JSON.stringify(webhookPayload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signPayload(`${timestamp}.${body}`, endpoint.secret);

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "WebhookDelivery/1.0",
    "X-Webhook-Id": event.id,
    "X-Webhook-Delivery-Id": delivery.id,
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Signature": `sha256=${signature}`,
    "X-Webhook-Attempt": String(attemptNumber),
  };

  const urlValidation = await validateWebhookUrl(endpoint.url, {
    environment: env.ENVIRONMENT,
  });

  if (!urlValidation.ok) {
    await db.insert(deliveryAttempts).values({
      deliveryId: delivery.id,
      attemptNumber,
      responseStatus: null,
      responseBody: null,
      responseTimeMs: 0,
      error: urlValidation.error,
      requestHeaders: sanitizeRequestHeaders(requestHeaders),
    });

    await db
      .update(deliveries)
      .set({
        status: "failed",
        attemptCount: attemptNumber,
        lastError: urlValidation.error,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, delivery.id));
    return;
  }

  const startTime = Date.now();
  const fetchResult = await executeWebhookFetch({
    url: urlValidation.normalizedUrl,
    headers: requestHeaders,
    body,
    isRedirectStatus,
  });

  const responseTimeMs = Date.now() - startTime;
  const { responseStatus, responseBody, error } = fetchResult;
  const failureClass = classifyDeliveryFailure(responseStatus, error);
  const storedResponseBody = prepareStoredResponseBody(responseBody, responseStatus, failureClass);
  const storedRequestHeaders = sanitizeRequestHeaders(requestHeaders);

  await db.insert(deliveryAttempts).values({
    deliveryId: delivery.id,
    attemptNumber,
    responseStatus,
    responseBody: storedResponseBody,
    responseTimeMs,
    error,
    requestHeaders: storedRequestHeaders,
  });

  if (failureClass === "success") {
    const newAvg = endpoint.avgResponseTimeMs
      ? Math.round((endpoint.avgResponseTimeMs + responseTimeMs) / 2)
      : responseTimeMs;

    await db
      .update(deliveries)
      .set({
        status: "delivered",
        attemptCount: attemptNumber,
        deliveredAt: new Date(),
        lastResponseStatus: responseStatus,
        lastResponseBody: storedResponseBody,
        lastResponseTimeMs: responseTimeMs,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, delivery.id));

    await db
      .update(webhookEndpoints)
      .set({
        status: "healthy",
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        avgResponseTimeMs: newAvg,
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));

    return;
  }

  const newFailures = endpoint.consecutiveFailures + 1;
  const endpointStatus = computeEndpointHealthStatus(newFailures);
  const lastError = error ?? `HTTP ${responseStatus}`;

  if (failureClass === "terminal") {
    await db
      .update(deliveries)
      .set({
        status: "failed",
        attemptCount: attemptNumber,
        lastResponseStatus: responseStatus,
        lastResponseBody: storedResponseBody,
        lastResponseTimeMs: responseTimeMs,
        lastError,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, delivery.id));

    await db
      .update(webhookEndpoints)
      .set({
        status: endpointStatus,
        consecutiveFailures: newFailures,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));

    return;
  }

  if (attemptNumber >= delivery.maxAttempts) {
    await db
      .update(deliveries)
      .set({
        status: "dead_lettered",
        attemptCount: attemptNumber,
        lastResponseStatus: responseStatus,
        lastResponseBody: storedResponseBody,
        lastResponseTimeMs: responseTimeMs,
        lastError,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, delivery.id));

    await db.insert(deadLetterQueue).values({
      deliveryId: delivery.id,
      reason: lastError + ` after ${attemptNumber} attempts`,
      finalAttemptNumber: attemptNumber,
    });

    await db
      .update(webhookEndpoints)
      .set({
        status: endpointStatus,
        consecutiveFailures: newFailures,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, endpoint.id));

    return;
  }

  const nextRetryAt = new Date(Date.now() + calculateBackoff(attemptNumber));

  await db
    .update(deliveries)
    .set({
      status: "pending",
      attemptCount: attemptNumber,
      nextRetryAt,
      lastResponseStatus: responseStatus,
      lastResponseBody: storedResponseBody,
      lastResponseTimeMs: responseTimeMs,
      lastError,
      updatedAt: new Date(),
    })
    .where(eq(deliveries.id, delivery.id));

  await db
    .update(webhookEndpoints)
    .set({
      status: endpointStatus,
      consecutiveFailures: newFailures,
      lastFailureAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(webhookEndpoints.id, endpoint.id));

  await env.DELIVERY_QUEUE.send(
    {
      deliveryId: delivery.id,
      attemptNumber: attemptNumber + 1,
    } satisfies QueueMessage,
    {
      delaySeconds: Math.ceil(calculateBackoff(attemptNumber) / 1000),
    }
  );
}
