/** Safe string read from Upstash Redis — avoids number/boolean coercion bugs. */
export function redisValueAsString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Compare a Redis value to an expected string (type-safe). */
export function redisValueEquals(value: unknown, expected: string): boolean {
  const raw = redisValueAsString(value);
  return raw === expected;
}

/** Check if Redis value matches any expected string (type-safe). */
export function redisValueIsOneOf(value: unknown, expected: string[]): boolean {
  const raw = redisValueAsString(value);
  return raw != null && expected.includes(raw);
}
