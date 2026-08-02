import { vi } from "vitest";

vi.mock("../middleware/ratelimit", () => ({
  ingestRateLimit: async (_c: unknown, next: () => Promise<void>) => next(),
  authRateLimit: async (_c: unknown, next: () => Promise<void>) => next(),
}));
