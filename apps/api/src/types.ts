import type { Database } from "@webhook-delivery/db";

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  ENVIRONMENT: string;
  DELIVERY_QUEUE: Queue;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  BREVO_API_KEY?: string;
  BREVO_SMTP_LOGIN?: string;
  BREVO_SMTP_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
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
