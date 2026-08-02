export type EndpointHealthStatus = "healthy" | "degraded" | "unhealthy";

export function computeEndpointHealthStatus(
  consecutiveFailures: number
): EndpointHealthStatus {
  if (consecutiveFailures >= 10) return "unhealthy";
  if (consecutiveFailures >= 3) return "degraded";
  return "healthy";
}
