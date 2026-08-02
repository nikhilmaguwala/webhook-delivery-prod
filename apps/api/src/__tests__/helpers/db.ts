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

export async function createTestDb(): Promise<TestDatabase> {
  const url = getTestDatabaseUrl();
  if (!url) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for integration tests");
  }

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
