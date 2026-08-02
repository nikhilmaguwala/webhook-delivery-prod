import { createDb } from "@webhook-delivery/db";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

export const dbMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = createDb(c.env.DATABASE_URL);
  c.set("db", db);
  await next();
};

export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
