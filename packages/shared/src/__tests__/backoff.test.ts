import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BASE_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  calculateBackoff,
} from "../index";

describe("calculateBackoff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a delay within the expected range for attempt 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const delay = calculateBackoff(1);
    expect(delay).toBe(BASE_RETRY_DELAY_MS);
  });

  it("doubles the base delay for attempt 2 without jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const delay = calculateBackoff(2);
    expect(delay).toBe(BASE_RETRY_DELAY_MS * 2);
  });

  it("adds up to 30% jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const delay = calculateBackoff(1);
    expect(delay).toBeCloseTo(BASE_RETRY_DELAY_MS * 1.3, 5);
  });

  it("caps delay at MAX_RETRY_DELAY_MS", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const delay = calculateBackoff(20);
    expect(delay).toBe(MAX_RETRY_DELAY_MS);
  });
});
