import { DELIVERY_LIMITS } from "./limits";

const REDACTION_PLACEHOLDER = "[REDACTED]";

const SENSITIVE_JSON_KEY =
  /(password|passwd|secret|token|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|credit[_-]?card|card[_-]?number|cvv|ssn|social[_-]?security)/i;

const BEARER_TOKEN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const CREDIT_CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const JWT_TOKEN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

export type ResponseBodyRetention = "none" | "sanitized";

export function getResponseBodyRetention(
  responseStatus: number | null,
  failureClass: "success" | "retryable" | "terminal"
): ResponseBodyRetention {
  if (failureClass === "success" || responseStatus === null) {
    return "none";
  }

  if (responseStatus >= 200 && responseStatus < 300) {
    return "none";
  }

  return "sanitized";
}

export function redactSensitiveText(input: string): string {
  let output = input;
  output = output.replace(BEARER_TOKEN, `Bearer ${REDACTION_PLACEHOLDER}`);
  output = output.replace(JWT_TOKEN, REDACTION_PLACEHOLDER);
  output = output.replace(CREDIT_CARD, REDACTION_PLACEHOLDER);

  try {
    const parsed = JSON.parse(input) as unknown;
    const redacted = redactJsonValue(parsed);
    return JSON.stringify(redacted);
  } catch {
    return output;
  }
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_JSON_KEY.test(key)) {
        result[key] = REDACTION_PLACEHOLDER;
      } else if (typeof nested === "string") {
        result[key] = redactSensitiveText(nested);
      } else {
        result[key] = redactJsonValue(nested);
      }
    }
    return result;
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  return value;
}

export function prepareStoredResponseBody(
  body: string | null,
  responseStatus: number | null,
  failureClass: "success" | "retryable" | "terminal"
): string | null {
  if (!body) return null;

  if (getResponseBodyRetention(responseStatus, failureClass) === "none") {
    return null;
  }

  const sanitized = redactSensitiveText(body);
  if (sanitized.length <= DELIVERY_LIMITS.maxStoredResponseBodyLength) {
    return sanitized;
  }

  return `${sanitized.slice(0, DELIVERY_LIMITS.maxStoredResponseBodyLength)}…`;
}

export function sanitizeRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|cookie|x-api-key|x-auth-token/i.test(key)) {
      sanitized[key] = REDACTION_PLACEHOLDER;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
