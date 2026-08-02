import { afterEach, describe, expect, it, vi } from "vitest";
import { DELIVERY_LIMITS } from "../limits";
import { executeWebhookFetch } from "../delivery-http";

describe("executeWebhookFetch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns successful responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));

    const result = await executeWebhookFetch({
      url: "https://example.com/webhook",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      fetchImpl,
    });

    expect(result.responseStatus).toBe(200);
    expect(result.responseBody).toBe("ok");
    expect(result.error).toBeNull();
  });

  it("uses the configured delivery timeout", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    ) as typeof fetch;

    const promise = executeWebhookFetch({
      url: "https://example.com/webhook",
      headers: {},
      body: "{}",
      timeoutMs: 1000,
      fetchImpl,
    });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.responseStatus).toBeNull();
    expect(result.error).toBe("Request timed out after 1000ms");
  });

  it("clears timeout handles after success", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));

    await executeWebhookFetch({
      url: "https://example.com/webhook",
      headers: {},
      body: "{}",
      fetchImpl,
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("clears timeout handles after network errors", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await executeWebhookFetch({
      url: "https://example.com/webhook",
      headers: {},
      body: "{}",
      fetchImpl,
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("defaults to the shared delivery timeout constant", () => {
    expect(DELIVERY_LIMITS.requestTimeoutMs).toBe(10_000);
  });

  it("treats redirects as errors without following them", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 302 }));

    const result = await executeWebhookFetch({
      url: "https://example.com/webhook",
      headers: {},
      body: "{}",
      isRedirectStatus: (status) => status >= 300 && status < 400,
      fetchImpl,
    });

    expect(result.responseStatus).toBeNull();
    expect(result.error).toContain("302");
  });
});
