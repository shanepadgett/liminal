/** The notice a turn stopped by an error leaves in the transcript. */

import { Match, Predicate } from "effect";

import { notice } from "@liminal/notices/contract";
import type { ModelError, ModelErrorReason, ServiceMissing } from "@liminal/sdk";

import type { TurnError } from "../contract.ts";

/** Why a held turn stopped: its step failed, or its plugin went away between steps. */
type StopError = TurnError | ServiceMissing;

const titles: Readonly<Record<ModelErrorReason, string>> = {
  "rate-limit": "Rate limited",
  quota: "Out of quota",
  auth: "Sign-in rejected",
  "context-overflow": "Context is full",
  "invalid-request": "Request rejected",
  provider: "Provider error",
  network: "Network error",
  "empty-response": "Empty response",
};

/** The message, then the status and request id when the provider sent them. */
const modelBody = (error: ModelError) => {
  const details = [
    ...(error.status === undefined ? [] : [`status ${error.status}`]),
    ...(error.requestId === undefined ? [] : [`request ${error.requestId}`]),
  ];

  return details.length === 0 ? error.message : `${error.message}\n${details.join(", ")}`;
};

const bodyOf = (error: StopError): string =>
  Match.valueTags(error, {
    ModelError: modelBody,
    ProviderNotFound: ({ provider }) => `No active provider is named ${provider}.`,
    CatalogUnavailable: ({ catalogId, message }) => `The ${catalogId} catalog: ${message}`,
    SessionNotFound: ({ sessionId }) => `Session ${sessionId} was not found.`,
    InvalidEntry: ({ kind, message }) => `A ${kind} entry: ${message}`,
    StoreError: ({ message }) => message,
    ServiceMissing: ({ service }) => `${service} is no longer active.`,
  });

/** An error notice titled by the model error's reason, or "Turn stopped". */
export const stoppedNotice = (error: StopError) =>
  notice({
    kind: "error",
    title: Predicate.isTagged(error, "ModelError") ? titles[error.reason] : "Turn stopped",
    body: bodyOf(error),
  });
