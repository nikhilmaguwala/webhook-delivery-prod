export const API_KEY_PREFIX = "whk_live_";
export const MAX_RETRY_ATTEMPTS = 5;
export const BASE_RETRY_DELAY_MS = 1000;
export const MAX_RETRY_DELAY_MS = 300_000;

export interface QueueMessage {
  deliveryId: string;
  attemptNumber: number;
}

export interface IngestEventRequest {
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookPayload {
  id: string;
  event_type: string;
  created_at: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function calculateBackoff(attemptNumber: number): number {
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attemptNumber - 1);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, MAX_RETRY_DELAY_MS);
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export { classifyDeliveryFailure, type DeliveryFailureClass } from "./retry-classification";
export {
  INGEST_LIMITS,
  DELIVERY_LIMITS,
  getJsonDepth,
  countJsonKeys,
  getSerializedJsonSize,
} from "./limits";
export {
  ingestEventSchema,
  validateIngestBody,
  parseIngestJson,
  type ValidatedIngestEvent,
  type IngestValidationResult,
} from "./ingest-validation";
export {
  prepareStoredResponseBody,
  redactSensitiveText,
  sanitizeRequestHeaders,
  getResponseBodyRetention,
} from "./response-body";
export { executeWebhookFetch, type WebhookFetchResult } from "./delivery-http";

export async function signPayload(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPayload(
  payload: string,
  secret: string,
  expectedHex: string
): Promise<boolean> {
  const actual = await signPayload(payload, secret);
  if (actual.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey(): { key: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const key = `${API_KEY_PREFIX}${random}`;
  return { key, prefix: key.slice(0, 16) };
}

export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hash = new Uint8Array(derived);
  const combined = new Uint8Array(salt.length + hash.length);
  combined.set(salt);
  combined.set(hash, salt.length);
  return btoa(String.fromCharCode(...combined));
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const storedHash = combined.slice(16);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hash = new Uint8Array(derived);
  if (hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash[i] ^ storedHash[i];
  }
  return diff === 0;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
