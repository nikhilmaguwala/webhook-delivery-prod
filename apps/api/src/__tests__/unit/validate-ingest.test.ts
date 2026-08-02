import { describe, expect, it } from "vitest";
import { validateIngestBody } from "../../lib/validate-ingest";

describe("validateIngestBody (api re-export)", () => {
  it("accepts a valid ingest payload", () => {
    const result = validateIngestBody({
      event_type: "order.created",
      payload: { order_id: "123" },
      idempotency_key: "idem-1",
      metadata: { source: "test" },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        event_type: "order.created",
        payload: { order_id: "123" },
        idempotency_key: "idem-1",
        metadata: { source: "test" },
      },
    });
  });

  it("rejects missing event_type", () => {
    const result = validateIngestBody({ payload: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("event_type");
    }
  });

  it("rejects non-object payload", () => {
    expect(validateIngestBody({ event_type: "x", payload: "bad" }).ok).toBe(false);
    expect(validateIngestBody(null).ok).toBe(false);
  });

  it("rejects invalid idempotency_key and metadata types", () => {
    expect(validateIngestBody({ event_type: "x", payload: {}, idempotency_key: 123 }).ok).toBe(false);
    expect(validateIngestBody({ event_type: "x", payload: {}, idempotency_key: "   " }).ok).toBe(false);
    expect(validateIngestBody({ event_type: "x", payload: {}, metadata: "bad" }).ok).toBe(false);
  });
});
