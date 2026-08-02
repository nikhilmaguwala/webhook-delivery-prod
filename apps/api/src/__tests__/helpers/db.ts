import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@webhook-delivery/db/schema";
import type { Database } from "@webhook-delivery/db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle"
);

export type TestDatabase = Database;

let pool: pg.Pool | null = null;
let migrationPromise: Promise<void> | null = null;

export function getTestDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL;
}

function assertSafeTestDatabase(url: string): void {
  const lower = url.toLowerCase();

  if (lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes("webhook_test")) {
    return;
  }

  if (lower.includes("neon.tech") || lower.includes("supabase.co") || lower.includes("aws.neon")) {
    throw new Error(
      "Refusing to run destructive integration tests against a hosted production database. " +
        "Set TEST_DATABASE_URL to a local Postgres instance or dedicated test database."
    );
  }

  if (process.env.ALLOW_REMOTE_TEST_DATABASE !== "true") {
    throw new Error(
      "Refusing to run integration tests against a remote database. " +
        "Use TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webhook_test"
    );
  }
}

export async function createTestDb(): Promise<TestDatabase> {
  const url = getTestDatabaseUrl();
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }

  assertSafeTestDatabase(url);

  if (!pool) {
    pool = new pg.Pool({ connectionString: url });
  }

  const db = drizzle(pool, { schema }) as unknown as TestDatabase;

  await runMigrations(pool);

  return db;
}

async function runMigrations(client: pg.Pool): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: migrationsDir });
    })();
  }

  await migrationPromise;
}

export async function resetDatabase(db: TestDatabase): Promise<void> {
  const url = getTestDatabaseUrl();
  if (url) {
    assertSafeTestDatabase(url);
  }

  await db.execute(sql`
    TRUNCATE TABLE
      dead_letter_queue,
      delivery_attempts,
      deliveries,
      events,
      api_keys,
      webhook_endpoints,
      project_invitations,
      project_members,
      audit_logs,
      projects,
      organization_members,
      organizations,
      users
    RESTART IDENTITY CASCADE
  `);
}

export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    migrationPromise = null;
  }
}
