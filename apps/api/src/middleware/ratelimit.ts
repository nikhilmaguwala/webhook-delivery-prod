import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

function createRatelimit(env: AppEnv["Bindings"], prefix: string, limit: number, window: string) {
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window as "1 m" | "1 h" | "1 s"),
    prefix: `webhook-delivery:${prefix}`,
  });
}

export const ingestRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const projectId = c.get("projectId");
  if (!projectId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const ratelimit = createRatelimit(c.env, "ingest", 1000, "1 m");
  const { success, limit, remaining, reset } = await ratelimit.limit(projectId);

  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(reset));

  if (!success) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  await next();
};

export const authRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  const ratelimit = createRatelimit(c.env, "auth", 20, "1 m");
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }

  await next();
};
