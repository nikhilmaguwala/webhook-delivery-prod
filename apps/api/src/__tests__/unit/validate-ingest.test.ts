import { describe, expect, it } from "vitest";
import { validateIngestBody } from "../../lib/validate-ingest";

describe("validateIngestBody", () => {
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
    expect(result).toEqual({ ok: false, error: "event_type is required" });
  });

  it("rejects non-object payload", () => {
    expect(validateIngestBody({ event_type: "x", payload: "bad" })).toEqual({
      ok: false,
      error: "payload is required and must be an object",
    });
    expect(validateIngestBody(null)).toEqual({
      ok: false,
      error: "payload is required and must be an object",
    });
  });

  it("rejects invalid idempotency_key and metadata types", () => {
    expect(
      validateIngestBody({ event_type: "x", payload: {}, idempotency_key: 123 })
    ).toEqual({ ok: false, error: "idempotency_key must be a string" });

    expect(
      validateIngestBody({ event_type: "x", payload: {}, idempotency_key: "   " })
    ).toEqual({ ok: false, error: "idempotency_key must not be empty" });

    expect(
      validateIngestBody({ event_type: "x", payload: {}, metadata: "bad" })
    ).toEqual({ ok: false, error: "metadata must be an object" });
  });
});
