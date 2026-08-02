import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

const nodePools = new Map<string, pg.Pool>();

function shouldUseNodePostgres(databaseUrl: string): boolean {
  return (
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1") ||
    process.env.USE_NODE_PG === "true"
  );
}

function createNodeDb(databaseUrl: string): Database {
  let pool = nodePools.get(databaseUrl);
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl });
    nodePools.set(databaseUrl, pool);
  }
  return drizzlePg(pool, { schema }) as unknown as Database;
}

export function createDb(databaseUrl: string): Database {
  if (shouldUseNodePostgres(databaseUrl)) {
    return createNodeDb(databaseUrl);
  }

  const sql = neon(databaseUrl);
  return drizzleNeon(sql, { schema });
}

export * from "./schema";
