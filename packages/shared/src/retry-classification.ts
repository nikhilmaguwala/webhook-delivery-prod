import { isSuccessStatus } from "./index";

export type DeliveryFailureClass = "success" | "retryable" | "terminal";

export function classifyDeliveryFailure(
  responseStatus: number | null,
  error: string | null
): DeliveryFailureClass {
  if (responseStatus !== null && isSuccessStatus(responseStatus)) {
    return "success";
  }

  if (responseStatus === null) {
    if (error?.includes("Redirects are not followed")) {
      return "terminal";
    }
    return "retryable";
  }

  if (responseStatus === 408 || responseStatus === 429) {
    return "retryable";
  }

  if (responseStatus >= 500) {
    return "retryable";
  }

  if (responseStatus >= 400 && responseStatus < 500) {
    return "terminal";
  }

  if (responseStatus >= 300 && responseStatus < 400) {
    return "terminal";
  }

  return "retryable";
}
