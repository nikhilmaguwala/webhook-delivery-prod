import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyAuth, sessionAuth } from "./middleware/auth";
import { dbMiddleware } from "./middleware/db";
import { authRateLimit, ingestRateLimit } from "./middleware/ratelimit";
import authRoutes from "./routes/auth";
import ingestRoutes from "./routes/ingest";
import managementRoutes from "./routes/management";
import { processDelivery } from "./services/delivery";
import type { AppEnv, Env } from "./types";
import type { QueueMessage } from "@webhook-delivery/shared";

const app = new Hono<AppEnv>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
}));

app.use("*", dbMiddleware);

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

const authApp = new Hono<AppEnv>();
authApp.use("/register", authRateLimit);
authApp.use("/login", authRateLimit);
authApp.use("/me", sessionAuth);
authApp.route("/", authRoutes);
app.route("/v1/auth", authApp);

app.use("/v1/ingest/*", apiKeyAuth);
app.use("/v1/ingest/*", ingestRateLimit);
app.route("/v1/ingest", ingestRoutes);

app.use("/v1/*", sessionAuth);
app.route("/v1", managementRoutes);

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processDelivery(message.body, env);
        message.ack();
      } catch (error) {
        console.error("Queue processing error:", error);
        message.retry();
      }
    }
  },
};
