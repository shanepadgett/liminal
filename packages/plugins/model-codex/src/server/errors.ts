/** `effect/ai` errors as Liminal model errors. */

import { Predicate } from "effect";
import type { AiError } from "effect/ai";

import { ModelError, type ModelErrorReason } from "@liminal/sdk";

const overflow = /context(_length| window| length)|too many tokens|maximum context/i;

const reasonOf = (error: AiError.AiError): ModelErrorReason => {
  const { reason } = error;
  if (Predicate.isTagged(reason, "RateLimitError")) return "rate-limit";
  if (Predicate.isTagged(reason, "QuotaExhaustedError")) return "quota";
  if (Predicate.isTagged(reason, "AuthenticationError")) return "auth";
  if (Predicate.isTagged(reason, "NetworkError")) return "network";
  if (overflow.test(error.message)) return "context-overflow";
  if (Predicate.isTagged(reason, "InvalidRequestError")) return "invalid-request";

  return "provider";
};

const requestIdOf = (headers: (typeof AiError.HttpResponseDetails.Type)["headers"] | undefined) => {
  const id = headers?.["x-request-id"];

  return Predicate.isString(id) ? id : undefined;
};

/** The model error for a failed call, with the status, retry delay and request id when known. */
export const toModelError = (error: AiError.AiError): ModelError => {
  const { reason } = error;
  const response = "http" in reason ? reason.http?.response : undefined;
  const retryAfter = Predicate.isTagged(reason, "RateLimitError") ? reason.retryAfter : undefined;

  return new ModelError({
    reason: reasonOf(error),
    message: error.message,
    status: response?.status,
    retryAfter,
    requestId: requestIdOf(response?.headers),
  });
};
