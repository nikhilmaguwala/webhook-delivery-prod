import { DELIVERY_LIMITS } from "./limits";

export type WebhookFetchResult = {
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
};

export type WebhookFetchOptions = {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
  isRedirectStatus?: (status: number) => boolean;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export async function executeWebhookFetch(options: WebhookFetchOptions): Promise<WebhookFetchResult> {
  const timeoutMs = options.timeoutMs ?? DELIVERY_LIMITS.requestTimeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    const response = await fetchImpl(options.url, {
      method: "POST",
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
      redirect: "manual",
    });

    responseStatus = response.status;
    responseBody = await response.text().catch(() => null);

    if (options.isRedirectStatus?.(response.status)) {
      error = `Redirects are not followed (received HTTP ${response.status})`;
      responseStatus = null;
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      error = `Request timed out after ${timeoutMs}ms`;
    } else {
      error = err instanceof Error ? err.message : "Unknown error";
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return { responseStatus, responseBody, error };
}
