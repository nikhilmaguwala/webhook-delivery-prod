export type ValidatedIngestBody = {
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
};

export type IngestValidationResult =
  | { ok: true; data: ValidatedIngestBody }
  | { ok: false; error: string };

export function validateIngestBody(body: unknown): IngestValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "payload is required and must be an object" };
  }

  const record = body as Record<string, unknown>;

  if (!record.event_type || typeof record.event_type !== "string") {
    return { ok: false, error: "event_type is required" };
  }

  if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) {
    return { ok: false, error: "payload is required and must be an object" };
  }

  if (record.idempotency_key !== undefined) {
    if (typeof record.idempotency_key !== "string") {
      return { ok: false, error: "idempotency_key must be a string" };
    }
    const trimmed = record.idempotency_key.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: "idempotency_key must not be empty" };
    }
    record.idempotency_key = trimmed;
  }

  if (
    record.metadata !== undefined &&
    (typeof record.metadata !== "object" || record.metadata === null || Array.isArray(record.metadata))
  ) {
    return { ok: false, error: "metadata must be an object" };
  }

  return {
    ok: true,
    data: {
      event_type: record.event_type,
      payload: record.payload as Record<string, unknown>,
      idempotency_key: record.idempotency_key as string | undefined,
      metadata: record.metadata as Record<string, unknown> | undefined,
    },
  };
}
