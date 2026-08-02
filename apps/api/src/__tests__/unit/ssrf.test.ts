import { describe, expect, it } from "vitest";
import { validateWebhookUrlSync } from "../../lib/ssrf";

describe("validateWebhookUrlSync", () => {
  it("accepts a valid public HTTPS URL", () => {
    const result = validateWebhookUrlSync("https://hooks.example.com/v1/receive", {
      environment: "production",
    });
    expect(result.ok).toBe(true);
  });

  it("requires HTTPS in production", () => {
    const result = validateWebhookUrlSync("http://hooks.example.com/v1/receive", {
      environment: "production",
    });
    expect(result).toEqual({ ok: false, error: "HTTPS is required for webhook URLs in production" });
  });

  it("rejects localhost", () => {
    const result = validateWebhookUrlSync("https://localhost/webhook", {
      environment: "test",
    });
    expect(result).toEqual({ ok: false, error: "Webhook URL hostname is not allowed" });
  });

  it("rejects loopback IP addresses", () => {
    const result = validateWebhookUrlSync("https://127.0.0.1/webhook", {
      environment: "test",
    });
    expect(result).toEqual({
      ok: false,
      error: "Webhook URL must not target private or reserved IP addresses",
    });
  });

  it("rejects link-local metadata addresses", () => {
    const result = validateWebhookUrlSync("http://169.254.169.254/latest/meta-data", {
      environment: "development",
    });
    expect(result).toEqual({
      ok: false,
      error: "Webhook URL must not target private or reserved IP addresses",
    });
  });

  it("rejects private network ranges", () => {
    expect(
      validateWebhookUrlSync("https://10.0.0.5/hook", { environment: "test" })
    ).toEqual({
      ok: false,
      error: "Webhook URL must not target private or reserved IP addresses",
    });

    expect(
      validateWebhookUrlSync("https://192.168.1.20/hook", { environment: "test" })
    ).toEqual({
      ok: false,
      error: "Webhook URL must not target private or reserved IP addresses",
    });
  });

  it("rejects credentials in the URL", () => {
    const result = validateWebhookUrlSync("https://user:pass@hooks.example.com/hook", {
      environment: "production",
    });
    expect(result).toEqual({ ok: false, error: "Webhook URLs must not include credentials" });
  });

  it("rejects unexpected ports in production", () => {
    const result = validateWebhookUrlSync("https://hooks.example.com:8080/hook", {
      environment: "production",
    });
    expect(result).toEqual({ ok: false, error: "Webhook URL uses a disallowed port" });
  });

  it("allows test hostnames in non-production environments", () => {
    const result = validateWebhookUrlSync("https://receiver-1.test/webhook", {
      environment: "test",
    });
    expect(result.ok).toBe(true);
  });
});
