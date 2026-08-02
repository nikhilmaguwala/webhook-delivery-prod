import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyAuth, sessionAuth } from "./middleware/auth";
import { dbMiddleware } from "./middleware/db";
import { authRateLimit, ingestRateLimit } from "./middleware/ratelimit";
import authRoutes from "./routes/auth";
import ingestRoutes from "./routes/ingest";
import invitationRoutes from "./routes/invitations";
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

// ── Ingest (API key) — register BEFORE any catch-all /v1 JWT mounts ──
app.use("/v1/ingest/*", apiKeyAuth);
app.use("/v1/ingest/*", ingestRateLimit);
app.route("/v1/ingest", ingestRoutes);

// ── Auth ──
const authApp = new Hono<AppEnv>();
authApp.use("/register", authRateLimit);
authApp.use("/login", authRateLimit);
authApp.use("/me", sessionAuth);
authApp.route("/", authRoutes);
app.route("/v1/auth", authApp);

// ── Invitations (public OTP + JWT-protected project routes inside) ──
const invitationApp = new Hono<AppEnv>();
invitationApp.use("/invitations/:token/send-otp", authRateLimit);
invitationApp.use("/invitations/:token/verify-otp", authRateLimit);
invitationApp.use("/invitations/:token/accept", authRateLimit);
invitationApp.route("/", invitationRoutes);
app.route("/v1", invitationApp);

// ── Management (JWT) — scoped middleware, NOT catch-all on /v1/* ──
const managementPrefixes = [
  "/v1/organizations/*",
  "/v1/projects/*",
  "/v1/endpoints/*",
  "/v1/deliveries/*",
  "/v1/api-keys/*",
];
for (const prefix of managementPrefixes) {
  app.use(prefix, sessionAuth);
}
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
