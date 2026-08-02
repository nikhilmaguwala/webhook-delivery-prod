import { describe, expect, it } from "vitest";
import { resolveIdempotencyKey } from "../../lib/ingest-event";

describe("resolveIdempotencyKey", () => {
  it("prefers body key over header", () => {
    expect(resolveIdempotencyKey("body-key", "header-key")).toBe("body-key");
  });

  it("uses header when body key is missing", () => {
    expect(resolveIdempotencyKey(undefined, "header-key")).toBe("header-key");
  });

  it("trims whitespace and ignores empty values", () => {
    expect(resolveIdempotencyKey("  key  ", undefined)).toBe("key");
    expect(resolveIdempotencyKey("   ", "header")).toBe("header");
    expect(resolveIdempotencyKey(undefined, "  ")).toBeUndefined();
  });
});
