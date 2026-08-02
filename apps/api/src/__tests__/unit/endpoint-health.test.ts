import { describe, expect, it } from "vitest";
import { computeEndpointHealthStatus } from "../../lib/endpoint-health";

describe("computeEndpointHealthStatus", () => {
  it("returns healthy below 3 failures", () => {
    expect(computeEndpointHealthStatus(0)).toBe("healthy");
    expect(computeEndpointHealthStatus(2)).toBe("healthy");
  });

  it("returns degraded between 3 and 9 failures", () => {
    expect(computeEndpointHealthStatus(3)).toBe("degraded");
    expect(computeEndpointHealthStatus(9)).toBe("degraded");
  });

  it("returns unhealthy at 10 or more failures", () => {
    expect(computeEndpointHealthStatus(10)).toBe("unhealthy");
    expect(computeEndpointHealthStatus(25)).toBe("unhealthy");
  });
});
