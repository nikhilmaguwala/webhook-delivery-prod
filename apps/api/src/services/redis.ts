import { Redis } from "@upstash/redis";
import type { Env } from "../types";

export function getRedis(env: Env) {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}
