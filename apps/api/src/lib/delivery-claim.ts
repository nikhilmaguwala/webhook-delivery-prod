import { deliveries } from "@webhook-delivery/db";
import type { Database } from "@webhook-delivery/db";
import { and, eq, lt, or, sql } from "drizzle-orm";

export const STALE_DELIVERY_LOCK_MS = 120_000;

export type ClaimedDelivery = {
  id: string;
  eventId: string;
  endpointId: string;
  attemptCount: number;
  maxAttempts: number;
  status: string;
};

export async function claimDelivery(
  db: Database,
  deliveryId: string,
  attemptNumber: number
): Promise<ClaimedDelivery | null> {
  const expectedAttemptCount = attemptNumber - 1;
  const staleBefore = new Date(Date.now() - STALE_DELIVERY_LOCK_MS);

  const [claimed] = await db
    .update(deliveries)
    .set({ status: "delivering", updatedAt: new Date() })
    .where(
      and(
        eq(deliveries.id, deliveryId),
        sql`${deliveries.attemptCount} = ${expectedAttemptCount}`,
        or(
          eq(deliveries.status, "pending"),
          and(eq(deliveries.status, "delivering"), lt(deliveries.updatedAt, staleBefore))
        )
      )
    )
    .returning({
      id: deliveries.id,
      eventId: deliveries.eventId,
      endpointId: deliveries.endpointId,
      attemptCount: deliveries.attemptCount,
      maxAttempts: deliveries.maxAttempts,
      status: deliveries.status,
    });

  return claimed ?? null;
}
