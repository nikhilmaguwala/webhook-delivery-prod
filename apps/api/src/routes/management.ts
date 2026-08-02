import {
  apiKeys,
  auditLogs,
  deadLetterQueue,
  deliveries,
  deliveryAttempts,
  events,
  organizationMembers,
  projects,
  webhookEndpoints,
} from "@webhook-delivery/db";
import {
  generateApiKey,
  generateSecret,
  hashApiKey,
  MAX_RETRY_ATTEMPTS,
  redactSensitiveText,
  sanitizeRequestHeaders,
  DELIVERY_LIMITS,
  slugify,
  type QueueMessage,
} from "@webhook-delivery/shared";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getClientIp } from "../middleware/db";
import { logAudit } from "../services/audit";
import { canManageProject, getProjectAccess } from "../services/project-access";
import { validateWebhookUrl } from "../lib/ssrf";
import type { AppEnv } from "../types";

const management = new Hono<AppEnv>();

function sanitizeAttemptForResponse(attempt: typeof deliveryAttempts.$inferSelect) {
  return {
    ...attempt,
    responseBody: attempt.responseBody
      ? redactSensitiveText(attempt.responseBody).slice(0, DELIVERY_LIMITS.maxStoredResponseBodyLength)
      : null,
    requestHeaders: sanitizeRequestHeaders((attempt.requestHeaders as Record<string, string> | null) ?? {}),
  };
}

function sanitizeDeliveryForResponse(delivery: typeof deliveries.$inferSelect) {
  return {
    ...delivery,
    lastResponseBody: delivery.lastResponseBody
      ? redactSensitiveText(delivery.lastResponseBody).slice(0, DELIVERY_LIMITS.maxStoredResponseBodyLength)
      : null,
  };
}

async function verifyOrgAccess(
  db: AppEnv["Variables"]["db"],
  userId: string,
  organizationId: string
) {
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      )
    )
    .limit(1);
  return membership;
}

management.get("/organizations/:orgId/projects", async (c) => {
  const userId = c.get("userId")!;
  const orgId = c.req.param("orgId");
  const db = c.get("db");

  if (!(await verifyOrgAccess(db, userId, orgId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const projectList = await db
    .select()
    .from(projects)
    .where(eq(projects.organizationId, orgId))
    .orderBy(desc(projects.createdAt));

  return c.json({ projects: projectList });
});

management.post("/organizations/:orgId/projects", async (c) => {
  const userId = c.get("userId")!;
  const orgId = c.req.param("orgId");
  const db = c.get("db");
  const body = await c.req.json<{ name?: string; description?: string }>();

  const membership = await verifyOrgAccess(db, userId, orgId);
  if (!membership || membership.role === "member") {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: orgId,
      name: body.name,
      slug: slugify(body.name),
      description: body.description ?? null,
      createdBy: userId,
    })
    .returning();

  await logAudit(db, {
    organizationId: orgId,
    userId,
    action: "create",
    resourceType: "project",
    resourceId: project.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ project }, 201);
});

management.get("/projects/:projectId/endpoints", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");

  if (!(await getProjectAccess(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const endpoints = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      description: webhookEndpoints.description,
      status: webhookEndpoints.status,
      enabled: webhookEndpoints.enabled,
      consecutiveFailures: webhookEndpoints.consecutiveFailures,
      lastSuccessAt: webhookEndpoints.lastSuccessAt,
      lastFailureAt: webhookEndpoints.lastFailureAt,
      avgResponseTimeMs: webhookEndpoints.avgResponseTimeMs,
      createdAt: webhookEndpoints.createdAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.projectId, projectId))
    .orderBy(desc(webhookEndpoints.createdAt));

  return c.json({ endpoints });
});

management.post("/projects/:projectId/endpoints", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const body = await c.req.json<{ url?: string; description?: string }>();

  if (!(await canManageProject(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return c.json({ error: "Not found" }, 404);

  if (!body.url) {
    return c.json({ error: "url is required" }, 400);
  }

  const urlValidation = await validateWebhookUrl(body.url, {
    environment: c.env.ENVIRONMENT,
  });
  if (!urlValidation.ok) {
    return c.json({ error: urlValidation.error }, 400);
  }

  const secret = generateSecret();
  const [endpoint] = await db
    .insert(webhookEndpoints)
    .values({
      projectId,
      url: urlValidation.normalizedUrl,
      description: body.description ?? null,
      secret,
    })
    .returning();

  await logAudit(db, {
    organizationId: project.organizationId,
    userId,
    action: "create",
    resourceType: "endpoint",
    resourceId: endpoint.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ endpoint: { ...endpoint, secret } }, 201);
});

management.patch("/endpoints/:endpointId", async (c) => {
  const userId = c.get("userId")!;
  const endpointId = c.req.param("endpointId");
  const db = c.get("db");
  const body = await c.req.json<{ enabled?: boolean; url?: string; description?: string }>();

  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .limit(1);

  if (!endpoint) return c.json({ error: "Not found" }, 404);

  if (!(await canManageProject(db, userId, endpoint.projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, endpoint.projectId))
    .limit(1);
  if (!project) return c.json({ error: "Not found" }, 404);

  const updates: Partial<typeof webhookEndpoints.$inferInsert> = { updatedAt: new Date() };
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.url) {
    const urlValidation = await validateWebhookUrl(body.url, {
      environment: c.env.ENVIRONMENT,
    });
    if (!urlValidation.ok) {
      return c.json({ error: urlValidation.error }, 400);
    }
    updates.url = urlValidation.normalizedUrl;
  }
  if (body.description !== undefined) updates.description = body.description;

  const [updated] = await db
    .update(webhookEndpoints)
    .set(updates)
    .where(eq(webhookEndpoints.id, endpointId))
    .returning();

  await logAudit(db, {
    organizationId: project.organizationId,
    userId,
    action: "update",
    resourceType: "endpoint",
    resourceId: endpointId,
    metadata: body,
    ipAddress: getClientIp(c),
  });

  return c.json({ endpoint: updated });
});

management.get("/projects/:projectId/api-keys", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");

  if (!(await getProjectAccess(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.projectId, projectId))
    .orderBy(desc(apiKeys.createdAt));

  return c.json({ api_keys: keys });
});

management.post("/projects/:projectId/api-keys", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const body = await c.req.json<{ name?: string }>();

  if (!(await canManageProject(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return c.json({ error: "Not found" }, 404);

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const { key, prefix } = generateApiKey();
  const keyHash = await hashApiKey(key);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({ projectId, name: body.name, keyPrefix: prefix, keyHash })
    .returning();

  await logAudit(db, {
    organizationId: project.organizationId,
    userId,
    action: "api_key_created",
    resourceType: "api_key",
    resourceId: apiKey.id,
    ipAddress: getClientIp(c),
  });

  return c.json({ api_key: { ...apiKey, key }, message: "Store this key securely. It won't be shown again." }, 201);
});

management.delete("/api-keys/:keyId", async (c) => {
  const userId = c.get("userId")!;
  const keyId = c.req.param("keyId");
  const db = c.get("db");

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);
  if (!apiKey) return c.json({ error: "Not found" }, 404);

  if (!(await canManageProject(db, userId, apiKey.projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, apiKey.projectId)).limit(1);
  if (!project) return c.json({ error: "Not found" }, 404);

  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, keyId));

  await logAudit(db, {
    organizationId: project.organizationId,
    userId,
    action: "api_key_revoked",
    resourceType: "api_key",
    resourceId: keyId,
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true });
});

management.get("/projects/:projectId/deliveries", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const status = c.req.query("status");

  if (!(await getProjectAccess(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const deliverySelect = {
    id: deliveries.id,
    status: deliveries.status,
    attemptCount: deliveries.attemptCount,
    lastResponseStatus: deliveries.lastResponseStatus,
    lastResponseTimeMs: deliveries.lastResponseTimeMs,
    lastError: deliveries.lastError,
    isReplay: deliveries.isReplay,
    deliveredAt: deliveries.deliveredAt,
    createdAt: deliveries.createdAt,
    eventType: events.eventType,
    eventId: events.id,
    endpointUrl: webhookEndpoints.url,
    endpointId: webhookEndpoints.id,
  };

  const deliveryList = await db
    .select(deliverySelect)
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(webhookEndpoints, eq(deliveries.endpointId, webhookEndpoints.id))
    .where(
      status
        ? and(eq(events.projectId, projectId), eq(deliveries.status, status as "pending" | "delivering" | "delivered" | "failed" | "dead_lettered"))
        : eq(events.projectId, projectId)
    )
    .orderBy(desc(deliveries.createdAt))
    .limit(limit);

  return c.json({ deliveries: deliveryList });
});

management.get("/deliveries/:deliveryId", async (c) => {
  const userId = c.get("userId")!;
  const deliveryId = c.req.param("deliveryId");
  const db = c.get("db");

  const [delivery] = await db
    .select({
      delivery: deliveries,
      event: events,
      endpoint: webhookEndpoints,
      projectId: projects.id,
      organizationId: projects.organizationId,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(webhookEndpoints, eq(deliveries.endpointId, webhookEndpoints.id))
    .innerJoin(projects, eq(events.projectId, projects.id))
    .where(eq(deliveries.id, deliveryId))
    .limit(1);

  if (!delivery || !(await getProjectAccess(db, userId, delivery.projectId))) {
    return c.json({ error: "Not found" }, 404);
  }

  const attempts = await db
    .select()
    .from(deliveryAttempts)
    .where(eq(deliveryAttempts.deliveryId, deliveryId))
    .orderBy(deliveryAttempts.attemptNumber);

  const [dlq] = await db
    .select()
    .from(deadLetterQueue)
    .where(eq(deadLetterQueue.deliveryId, deliveryId))
    .limit(1);

  return c.json({
    delivery: sanitizeDeliveryForResponse(delivery.delivery),
    event: {
      id: delivery.event.id,
      event_type: delivery.event.eventType,
      payload: delivery.event.payload,
      metadata: delivery.event.metadata,
      created_at: delivery.event.createdAt,
    },
    endpoint: {
      id: delivery.endpoint.id,
      url: delivery.endpoint.url,
      status: delivery.endpoint.status,
    },
    attempts: attempts.map(sanitizeAttemptForResponse),
    dead_letter: dlq ?? null,
  });
});

management.post("/deliveries/:deliveryId/replay", async (c) => {
  const userId = c.get("userId")!;
  const deliveryId = c.req.param("deliveryId");
  const db = c.get("db");

  const [delivery] = await db
    .select({
      delivery: deliveries,
      projectId: projects.id,
      organizationId: projects.organizationId,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(projects, eq(events.projectId, projects.id))
    .where(eq(deliveries.id, deliveryId))
    .limit(1);

  if (!delivery || !(await canManageProject(db, userId, delivery.projectId))) {
    return c.json({ error: "Not found" }, 404);
  }

  await db
    .update(deliveries)
    .set({
      status: "pending",
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      isReplay: true,
      updatedAt: new Date(),
    })
    .where(eq(deliveries.id, deliveryId));

  await c.env.DELIVERY_QUEUE.send({
    deliveryId,
    attemptNumber: 1,
  } satisfies QueueMessage);

  await logAudit(db, {
    organizationId: delivery.organizationId,
    userId,
    action: "replay",
    resourceType: "delivery",
    resourceId: deliveryId,
    ipAddress: getClientIp(c),
  });

  return c.json({ success: true, message: "Delivery replay queued" });
});

management.get("/projects/:projectId/analytics", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const days = Math.min(parseInt(c.req.query("days") || "7"), 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  if (!(await getProjectAccess(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [stats] = await db
    .select({
      total: count(),
      delivered: sql<number>`count(*) filter (where ${deliveries.status} = 'delivered')`,
      failed: sql<number>`count(*) filter (where ${deliveries.status} in ('failed', 'dead_lettered'))`,
      pending: sql<number>`count(*) filter (where ${deliveries.status} in ('pending', 'delivering'))`,
      avgResponseTime: sql<number>`avg(${deliveries.lastResponseTimeMs}) filter (where ${deliveries.status} = 'delivered')`,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .where(and(eq(events.projectId, projectId), gte(deliveries.createdAt, since)));

  const dailyStats = await db
    .select({
      date: sql<string>`date(${deliveries.createdAt})`,
      total: count(),
      delivered: sql<number>`count(*) filter (where ${deliveries.status} = 'delivered')`,
      failed: sql<number>`count(*) filter (where ${deliveries.status} in ('failed', 'dead_lettered'))`,
      avgResponseTime: sql<number>`avg(${deliveries.lastResponseTimeMs}) filter (where ${deliveries.status} = 'delivered')`,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .where(and(eq(events.projectId, projectId), gte(deliveries.createdAt, since)))
    .groupBy(sql`date(${deliveries.createdAt})`)
    .orderBy(sql`date(${deliveries.createdAt})`);

  const endpointHealth = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      status: webhookEndpoints.status,
      enabled: webhookEndpoints.enabled,
      consecutiveFailures: webhookEndpoints.consecutiveFailures,
      avgResponseTimeMs: webhookEndpoints.avgResponseTimeMs,
      lastSuccessAt: webhookEndpoints.lastSuccessAt,
      lastFailureAt: webhookEndpoints.lastFailureAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.projectId, projectId));

  return c.json({
    period_days: days,
    summary: {
      total: Number(stats?.total ?? 0),
      delivered: Number(stats?.delivered ?? 0),
      failed: Number(stats?.failed ?? 0),
      pending: Number(stats?.pending ?? 0),
      success_rate:
        stats?.total && Number(stats.total) > 0
          ? Math.round((Number(stats.delivered) / Number(stats.total)) * 100)
          : 0,
      avg_response_time_ms: Math.round(Number(stats?.avgResponseTime ?? 0)),
    },
    daily: dailyStats.map((d) => ({
      date: d.date,
      total: Number(d.total),
      delivered: Number(d.delivered),
      failed: Number(d.failed),
      avg_response_time_ms: Math.round(Number(d.avgResponseTime ?? 0)),
    })),
    endpoint_health: endpointHealth,
  });
});

management.get("/organizations/:orgId/audit-logs", async (c) => {
  const userId = c.get("userId")!;
  const orgId = c.req.param("orgId");
  const db = c.get("db");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);

  if (!(await verifyOrgAccess(db, userId, orgId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, orgId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return c.json({ audit_logs: logs });
});

management.get("/projects/:projectId/events", async (c) => {
  const userId = c.get("userId")!;
  const projectId = c.req.param("projectId");
  const db = c.get("db");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);

  if (!(await getProjectAccess(db, userId, projectId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const eventList = await db
    .select()
    .from(events)
    .where(eq(events.projectId, projectId))
    .orderBy(desc(events.createdAt))
    .limit(limit);

  return c.json({ events: eventList });
});

export default management;
