import { describe, expect, it } from "vitest";
import { INGEST_LIMITS } from "../limits";
import { parseIngestJson, validateIngestBody } from "../ingest-validation";

function makePayload(size: number) {
  return { data: "x".repeat(size) };
}

describe("parseIngestJson", () => {
  it("parses valid JSON within size limits", () => {
    const result = parseIngestJson('{"event_type":"test.event","payload":{"ok":true}}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bodyBytes).toBeGreaterThan(0);
    }
  });

  it("rejects invalid JSON", () => {
    const result = parseIngestJson("{not-json");
    expect(result).toEqual({ ok: false, status: 400, error: "Invalid JSON body" });
  });

  it("rejects empty bodies", () => {
    const result = parseIngestJson("");
    expect(result).toEqual({ ok: false, status: 400, error: "payload is required and must be an object" });
  });

  it("rejects oversized raw bodies with 413", () => {
    const huge = JSON.stringify({
      event_type: "test.event",
      payload: makePayload(INGEST_LIMITS.maxBodyBytes),
    });
    const result = parseIngestJson(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });
});

describe("validateIngestBody", () => {
  it("accepts a valid ingest payload", () => {
    const result = validateIngestBody({
      event_type: "order.created",
      payload: { order_id: "123" },
      idempotency_key: "idem-1",
      metadata: { source: "test" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.event_type).toBe("order.created");
    }
  });

  it("rejects missing root object", () => {
    expect(validateIngestBody(null)).toEqual({
      ok: false,
      status: 400,
      error: "payload is required and must be an object",
    });
    expect(validateIngestBody([])).toEqual({
      ok: false,
      status: 400,
      error: "payload is required and must be an object",
    });
  });

  it("rejects unknown top-level fields", () => {
    const result = validateIngestBody({
      event_type: "test.event",
      payload: {},
      extra: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects empty and invalid event types", () => {
    expect(validateIngestBody({ event_type: "", payload: {} }).ok).toBe(false);
    expect(validateIngestBody({ event_type: "a".repeat(200), payload: {} }).ok).toBe(false);
    expect(validateIngestBody({ event_type: "invalid type!", payload: {} }).ok).toBe(false);
  });

  it("rejects non-object payload and metadata", () => {
    expect(validateIngestBody({ event_type: "x", payload: "bad" }).ok).toBe(false);
    expect(validateIngestBody({ event_type: "x", payload: [], metadata: {} }).ok).toBe(false);
    expect(validateIngestBody({ event_type: "x", payload: {}, metadata: "bad" }).ok).toBe(false);
  });

  it("rejects empty idempotency keys and oversized payloads", () => {
    expect(
      validateIngestBody({ event_type: "x", payload: {}, idempotency_key: "   " }).ok
    ).toBe(false);

    const oversizedPayload = makePayload(INGEST_LIMITS.maxPayloadBytes + 1);
    expect(
      validateIngestBody({ event_type: "x", payload: oversizedPayload }).ok
    ).toBe(false);
  });

  it("rejects deeply nested payloads", () => {
    let nested: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < INGEST_LIMITS.maxPayloadDepth + 2; i++) {
      nested = { child: nested };
    }

    expect(validateIngestBody({ event_type: "x", payload: nested }).ok).toBe(false);
  });

  it("rejects payloads with too many keys", () => {
    const payload: Record<string, number> = {};
    for (let i = 0; i < INGEST_LIMITS.maxPayloadKeys + 1; i++) {
      payload[`key_${i}`] = i;
    }

    expect(validateIngestBody({ event_type: "x", payload }).ok).toBe(false);
  });

  it("rejects oversized request bodies via bodyBytes option", () => {
    const result = validateIngestBody(
      { event_type: "x", payload: {} },
      { bodyBytes: INGEST_LIMITS.maxBodyBytes + 1 }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
    }
  });

  it("allows common event naming patterns", () => {
    for (const eventType of ["user.signup", "order/created", "payment_succeeded", "test-event"]) {
      const result = validateIngestBody({ event_type: eventType, payload: { ok: true } });
      expect(result.ok).toBe(true);
    }
  });
});
