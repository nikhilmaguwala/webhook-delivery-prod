import {
  apiKeys,
  deliveries,
  events,
  organizationMembers,
  organizations,
  projectMembers,
  projects,
  users,
  webhookEndpoints,
} from "@webhook-delivery/db";
import { generateApiKey, generateSecret, hashApiKey, hashPassword, type QueueMessage } from "@webhook-delivery/shared";
import { and, eq } from "drizzle-orm";
import { createJwt } from "../../middleware/auth";
import type { Env } from "../../types";
import type { TestDatabase } from "./db";

export type TestFixture = {
  creator: { id: string; email: string; token: string };
  admin: { id: string; email: string; token: string };
  member: { id: string; email: string; token: string };
  outsider: { id: string; email: string; token: string };
  organizationId: string;
  projectId: string;
  apiKey: string;
  endpointIds: string[];
};

const JWT_SECRET = "test-jwt-secret-for-integration-tests";

export function createMockQueue(messages: unknown[] = []) {
  return {
    send: async (message: QueueMessage) => {
      messages.push(message);
    },
    sendBatch: async () => {},
    metrics: async () => ({}),
  } as unknown as Env["DELIVERY_QUEUE"];
}

export function createTestEnv(messages: unknown[] = []): Env {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required");
  }

  return {
    DATABASE_URL: url,
    JWT_SECRET,
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    ENVIRONMENT: "test",
    DELIVERY_QUEUE: createMockQueue(messages),
  };
}

export async function seedProjectFixture(db: TestDatabase): Promise<TestFixture> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const creatorPassword = await hashPassword("password123");
  const [creator] = await db
    .insert(users)
    .values({ email: `creator-${suffix}@example.com`, name: "Creator", passwordHash: creatorPassword })
    .returning();

  const [admin] = await db
    .insert(users)
    .values({ email: `admin-${suffix}@example.com`, name: "Admin", passwordHash: creatorPassword })
    .returning();

  const [member] = await db
    .insert(users)
    .values({ email: `member-${suffix}@example.com`, name: "Member", passwordHash: creatorPassword })
    .returning();

  const [outsider] = await db
    .insert(users)
    .values({ email: `outsider-${suffix}@example.com`, name: "Outsider", passwordHash: creatorPassword })
    .returning();

  const [org] = await db
    .insert(organizations)
    .values({ name: `Test Org ${suffix}`, slug: `test-org-${suffix}` })
    .returning();

  await db.insert(organizationMembers).values([
    { organizationId: org.id, userId: creator.id, role: "owner" },
    { organizationId: org.id, userId: admin.id, role: "admin" },
    { organizationId: org.id, userId: member.id, role: "member" },
  ]);

  const [project] = await db
    .insert(projects)
    .values({
      organizationId: org.id,
      name: `Test Project ${suffix}`,
      slug: `test-project-${suffix}`,
      createdBy: creator.id,
    })
    .returning();

  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: member.id,
    role: "member",
  });

  const { key: apiKey, prefix } = generateApiKey();
  await db.insert(apiKeys).values({
    projectId: project.id,
    name: "Test Key",
    keyPrefix: prefix,
    keyHash: await hashApiKey(apiKey),
  });

  const endpointRows = await db
    .insert(webhookEndpoints)
    .values([
      {
        projectId: project.id,
        url: "https://receiver-1.test/webhook",
        secret: generateSecret(),
        enabled: true,
      },
      {
        projectId: project.id,
        url: "https://receiver-2.test/webhook",
        secret: generateSecret(),
        enabled: true,
      },
    ])
    .returning({ id: webhookEndpoints.id });

  const [creatorToken, adminToken, memberToken, outsiderToken] = await Promise.all([
    createJwt(creator.id, JWT_SECRET),
    createJwt(admin.id, JWT_SECRET),
    createJwt(member.id, JWT_SECRET),
    createJwt(outsider.id, JWT_SECRET),
  ]);

  return {
    creator: { id: creator.id, email: creator.email, token: creatorToken },
    admin: { id: admin.id, email: admin.email, token: adminToken },
    member: { id: member.id, email: member.email, token: memberToken },
    outsider: { id: outsider.id, email: outsider.email, token: outsiderToken },
    organizationId: org.id,
    projectId: project.id,
    apiKey,
    endpointIds: endpointRows.map((row) => row.id),
  };
}

export async function getDeliveryCountForEvent(db: TestDatabase, eventId: string): Promise<number> {
  const rows = await db.select().from(deliveries).where(eq(deliveries.eventId, eventId));
  return rows.length;
}

export async function getEventByIdempotencyKey(
  db: TestDatabase,
  projectId: string,
  idempotencyKey: string
) {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, idempotencyKey)))
    .limit(1);
  return event ?? null;
}
