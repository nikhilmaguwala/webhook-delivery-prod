import { describe, expect, it } from "vitest";
import {
  countJsonKeys,
  getJsonDepth,
  getSerializedJsonSize,
  INGEST_LIMITS,
} from "../limits";

describe("json limit helpers", () => {
  it("measures depth and key counts", () => {
    const payload = { a: { b: { c: 1 } }, items: [{ d: 2 }] };
    expect(getJsonDepth(payload)).toBe(3);
    expect(countJsonKeys(payload)).toBe(5);
    expect(getSerializedJsonSize(payload)).toBeGreaterThan(0);
  });
});

describe("INGEST_LIMITS", () => {
  it("defines production-safe defaults", () => {
    expect(INGEST_LIMITS.maxBodyBytes).toBe(256 * 1024);
    expect(INGEST_LIMITS.maxPayloadBytes).toBe(128 * 1024);
  });
});
