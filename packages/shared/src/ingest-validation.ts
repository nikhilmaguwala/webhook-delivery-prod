import { z } from "zod";
import {
  countJsonKeys,
  getJsonDepth,
  getSerializedJsonSize,
  INGEST_LIMITS,
  type JsonObject,
} from "./limits";

const eventTypeSchema = z
  .string({ required_error: "event_type is required" })
  .trim()
  .min(1, "event_type is required")
  .max(INGEST_LIMITS.maxEventTypeLength, `event_type must be at most ${INGEST_LIMITS.maxEventTypeLength} characters`)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/,
    "event_type must start with a letter or number and contain only letters, numbers, dots, underscores, slashes, or hyphens"
  );

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "idempotency_key must not be empty")
  .max(
    INGEST_LIMITS.maxIdempotencyKeyLength,
    `idempotency_key must be at most ${INGEST_LIMITS.maxIdempotencyKeyLength} characters`
  );

function addJsonObjectIssues(
  value: unknown,
  ctx: z.RefinementCtx,
  label: "payload" | "metadata",
  maxBytes: number
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} is required and must be an object`,
    });
    return;
  }

  const depth = getJsonDepth(value);
  if (depth > INGEST_LIMITS.maxPayloadDepth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} exceeds maximum nesting depth of ${INGEST_LIMITS.maxPayloadDepth}`,
    });
  }

  const keyCount = countJsonKeys(value);
  if (keyCount > INGEST_LIMITS.maxPayloadKeys) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} exceeds maximum of ${INGEST_LIMITS.maxPayloadKeys} keys`,
    });
  }

  const size = getSerializedJsonSize(value);
  if (size > maxBytes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${label} exceeds maximum size of ${maxBytes} bytes`,
    });
  }
}

const payloadSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => addJsonObjectIssues(value, ctx, "payload", INGEST_LIMITS.maxPayloadBytes));

const metadataSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => addJsonObjectIssues(value, ctx, "metadata", INGEST_LIMITS.maxMetadataBytes))
  .optional();

export const ingestEventSchema = z
  .object({
    event_type: eventTypeSchema,
    payload: payloadSchema,
    idempotency_key: idempotencyKeySchema.optional(),
    metadata: metadataSchema,
  })
  .strict();

export type ValidatedIngestEvent = z.infer<typeof ingestEventSchema>;

export type IngestValidationResult =
  | { ok: true; data: ValidatedIngestEvent }
  | { ok: false; error: string; status: 400 | 413 };

export function validateIngestBody(
  body: unknown,
  options?: { bodyBytes?: number }
): IngestValidationResult {
  if (options?.bodyBytes !== undefined && options.bodyBytes > INGEST_LIMITS.maxBodyBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request body exceeds maximum size of ${INGEST_LIMITS.maxBodyBytes} bytes`,
    };
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "payload is required and must be an object" };
  }

  const parsed = ingestEventSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      status: 400,
      error: issue?.message ?? "Invalid ingest payload",
    };
  }

  return { ok: true, data: parsed.data };
}

export function parseIngestJson(
  rawText: string
): { ok: true; body: unknown; bodyBytes: number } | { ok: false; error: string; status: 400 | 413 } {
  const bodyBytes = new TextEncoder().encode(rawText).length;
  if (bodyBytes > INGEST_LIMITS.maxBodyBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request body exceeds maximum size of ${INGEST_LIMITS.maxBodyBytes} bytes`,
    };
  }

  if (bodyBytes === 0) {
    return { ok: false, status: 400, error: "payload is required and must be an object" };
  }

  try {
    return { ok: true, body: JSON.parse(rawText) as unknown, bodyBytes };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}
