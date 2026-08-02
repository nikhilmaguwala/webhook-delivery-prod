import { describe, expect, it } from "vitest";
import { classifyDeliveryFailure } from "../retry-classification";

describe("classifyDeliveryFailure", () => {
  it("treats 2xx as success", () => {
    expect(classifyDeliveryFailure(200, null)).toBe("success");
    expect(classifyDeliveryFailure(204, null)).toBe("success");
  });

  it("retries server errors and rate limits", () => {
    expect(classifyDeliveryFailure(500, null)).toBe("retryable");
    expect(classifyDeliveryFailure(502, null)).toBe("retryable");
    expect(classifyDeliveryFailure(429, null)).toBe("retryable");
    expect(classifyDeliveryFailure(408, null)).toBe("retryable");
  });

  it("fails permanently on most client errors", () => {
    expect(classifyDeliveryFailure(400, null)).toBe("terminal");
    expect(classifyDeliveryFailure(401, null)).toBe("terminal");
    expect(classifyDeliveryFailure(404, null)).toBe("terminal");
    expect(classifyDeliveryFailure(422, null)).toBe("terminal");
  });

  it("retries network errors but not redirects", () => {
    expect(classifyDeliveryFailure(null, "network timeout")).toBe("retryable");
    expect(classifyDeliveryFailure(null, "Redirects are not followed (received HTTP 302)")).toBe(
      "terminal"
    );
  });

  it("treats 3xx as terminal", () => {
    expect(classifyDeliveryFailure(301, null)).toBe("terminal");
  });
});
