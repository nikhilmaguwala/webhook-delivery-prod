import { describe, expect, it } from "vitest";
import { DELIVERY_LIMITS } from "../limits";
import {
  getResponseBodyRetention,
  prepareStoredResponseBody,
  redactSensitiveText,
  sanitizeRequestHeaders,
} from "../response-body";

describe("getResponseBodyRetention", () => {
  it("does not retain successful response bodies", () => {
    expect(getResponseBodyRetention(200, "success")).toBe("none");
    expect(getResponseBodyRetention(201, "success")).toBe("none");
  });

  it("retains sanitized bodies for failures", () => {
    expect(getResponseBodyRetention(500, "retryable")).toBe("sanitized");
    expect(getResponseBodyRetention(404, "terminal")).toBe("sanitized");
    expect(getResponseBodyRetention(null, "retryable")).toBe("none");
  });
});

describe("redactSensitiveText", () => {
  it("redacts bearer tokens and JWTs", () => {
    const input = "Authorization: Bearer secret-token-123 eyJhbGciOiJIUzI1NiJ9.payload.sig";
    const output = redactSensitiveText(input);
    expect(output).not.toContain("secret-token-123");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts sensitive JSON keys", () => {
    const output = redactSensitiveText(
      JSON.stringify({ password: "super-secret", api_key: "whk_live_abc", ok: true })
    );
    const parsed = JSON.parse(output) as Record<string, string>;
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.api_key).toBe("[REDACTED]");
    expect(parsed.ok).toBe(true);
  });

  it("redacts credit card numbers in plain text", () => {
    const output = redactSensitiveText("card 4111 1111 1111 1111");
    expect(output).not.toContain("4111 1111 1111 1111");
  });
});

describe("prepareStoredResponseBody", () => {
  it("returns null for successful deliveries", () => {
    expect(prepareStoredResponseBody('{"ok":true}', 200, "success")).toBeNull();
  });

  it("stores sanitized failure bodies with truncation", () => {
    const body = JSON.stringify({ error: "failed", token: "abc123" });
    const stored = prepareStoredResponseBody(body, 500, "retryable");
    expect(stored).toContain("[REDACTED]");
    expect(stored!.length).toBeLessThanOrEqual(DELIVERY_LIMITS.maxStoredResponseBodyLength + 1);
  });

  it("returns null for empty bodies", () => {
    expect(prepareStoredResponseBody(null, 500, "retryable")).toBeNull();
  });
});

describe("sanitizeRequestHeaders", () => {
  it("redacts auth-related headers", () => {
    const sanitized = sanitizeRequestHeaders({
      "Content-Type": "application/json",
      Authorization: "Bearer secret",
      "X-Api-Key": "whk_live_test",
      "X-Webhook-Id": "event-1",
    });

    expect(sanitized["Content-Type"]).toBe("application/json");
    expect(sanitized.Authorization).toBe("[REDACTED]");
    expect(sanitized["X-Api-Key"]).toBe("[REDACTED]");
    expect(sanitized["X-Webhook-Id"]).toBe("event-1");
  });
});
