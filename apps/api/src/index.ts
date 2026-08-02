import app from "./app";
import { processDelivery } from "./services/delivery";
import type { Env } from "./types";
import type { QueueMessage } from "@webhook-delivery/shared";

export { default as app } from "./app";

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
