import type { Database } from "@webhook-delivery/db";

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  ENVIRONMENT: string;
  DELIVERY_QUEUE: Queue;
}

export type AppVariables = {
  db: Database;
  userId?: string;
  projectId?: string;
  organizationId?: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
