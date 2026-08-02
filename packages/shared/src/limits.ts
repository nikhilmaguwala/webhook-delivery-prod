export const INGEST_LIMITS = {
  maxBodyBytes: 256 * 1024,
  maxEventTypeLength: 128,
  maxIdempotencyKeyLength: 256,
  maxPayloadBytes: 128 * 1024,
  maxMetadataBytes: 16 * 1024,
  maxPayloadDepth: 12,
  maxPayloadKeys: 200,
} as const;

export const DELIVERY_LIMITS = {
  requestTimeoutMs: 10_000,
  maxStoredResponseBodyLength: 2_048,
} as const;

export type JsonObject = Record<string, unknown>;

export function getJsonDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== "object") {
    return depth;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return depth + 1;
    return Math.max(...value.map((item) => getJsonDepth(item, depth + 1)));
  }

  const entries = Object.values(value as JsonObject);
  if (entries.length === 0) return depth + 1;
  return Math.max(...entries.map((item) => getJsonDepth(item, depth + 1)));
}

export function countJsonKeys(value: unknown): number {
  if (value === null || typeof value !== "object") {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce<number>((total, item) => total + countJsonKeys(item), 0);
  }

  const object = value as JsonObject;
  return Object.keys(object).length + Object.values(object).reduce<number>((total, item) => total + countJsonKeys(item), 0);
}

export function getSerializedJsonSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
