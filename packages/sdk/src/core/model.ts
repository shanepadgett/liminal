/**
 * What the model sees and the seam every provider plugs into, in Liminal's own Schemas, so an
 * Effect upgrade cannot break saved sessions.
 */

import { Schema } from "effect";

/** Opaque provider metadata a provider needs back on the next request, such as signatures. */
const ProviderData = Schema.Record(Schema.String, Schema.Json);

/** A tool as the model sees it. */
export const ToolSpec = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  /** A JSON Schema for the params object. */
  parameters: Schema.Json,
});

export type ToolSpec = typeof ToolSpec.Type;

/** What the model sees, in Liminal's own types, so an Effect upgrade cannot break saved sessions. */
export const ModelPart = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String, providerData: ProviderData }),
  Schema.Struct({
    type: Schema.Literal("reasoning"),
    text: Schema.String,
    providerData: ProviderData,
  }),
  Schema.Struct({
    type: Schema.Literal("tool-call"),
    id: Schema.String,
    name: Schema.String,
    params: Schema.Json,
    providerData: ProviderData,
  }),
  Schema.Struct({
    type: Schema.Literal("tool-result"),
    callId: Schema.String,
    name: Schema.String,
    result: Schema.Json,
    isFailure: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("image"),
    path: Schema.String,
    mediaType: Schema.Literals(["image/png", "image/jpeg", "image/webp"]),
  }),
  /** In system messages only: offers or withdraws a tool from this point on. */
  Schema.Struct({
    type: Schema.Literal("tool-change"),
    change: Schema.Literals(["offer", "withdraw"]),
    tool: ToolSpec,
  }),
]);

export type ModelPart = typeof ModelPart.Type;

export const ModelContent = Schema.Struct({
  role: Schema.Literals(["system", "user", "assistant", "tool"]),
  parts: Schema.Array(ModelPart),
});

export type ModelContent = typeof ModelContent.Type;

/** A model by its provider and the provider's id for it. */
export const ModelRef = Schema.Struct({ provider: Schema.String, id: Schema.String });
export type ModelRef = typeof ModelRef.Type;

export const ThinkingLevel = Schema.Literals(["off", "minimal", "low", "medium", "high", "xhigh"]);
export type ThinkingLevel = typeof ThinkingLevel.Type;

/** A tool declared on the request; one not offered at the start waits for a `tool-change` offer. */
export const ModelTool = Schema.Struct({ ...ToolSpec.fields, offered: Schema.Boolean });
export type ModelTool = typeof ModelTool.Type;

export const ModelRequest = Schema.Struct({
  model: ModelRef,
  messages: Schema.Array(ModelContent),
  tools: Schema.Array(ModelTool),
  thinking: ThinkingLevel,
  maxOutputTokens: Schema.optional(Schema.Int),
  /** Groups requests that share a prefix, such as one session's. */
  cacheKey: Schema.optional(Schema.String),
  /** Extra request fields, keyed by provider id; each provider reads only its own. */
  providerOptions: Schema.optional(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
  ),
});

export type ModelRequest = typeof ModelRequest.Type;

export const Usage = Schema.Struct({
  input: Schema.Int,
  output: Schema.Int,
  cacheRead: Schema.Int,
  cacheWrite: Schema.Int,
  reasoning: Schema.Int,
});

export type Usage = typeof Usage.Type;

export const FinishReason = Schema.Literals([
  "stop",
  "length",
  "tool-calls",
  "content-filter",
  "other",
]);

export type FinishReason = typeof FinishReason.Type;

/** What a part holds while it streams; a tool call's params stream as raw JSON text. */
export const PartKind = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text") }),
  Schema.Struct({ type: Schema.Literal("reasoning") }),
  Schema.Struct({ type: Schema.Literal("tool-call"), id: Schema.String, name: Schema.String }),
]);

export type PartKind = typeof PartKind.Type;

/** One event of a streamed reply; `index` numbers the reply's parts from 0. */
export const ModelEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("start") }),
  Schema.Struct({ type: Schema.Literal("part-start"), index: Schema.Int, part: PartKind }),
  Schema.Struct({ type: Schema.Literal("delta"), index: Schema.Int, text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("part-end"), index: Schema.Int, part: ModelPart }),
  Schema.Struct({ type: Schema.Literal("finish"), reason: FinishReason, usage: Usage }),
]);

export type ModelEvent = typeof ModelEvent.Type;

export const ModelErrorReason = Schema.Literals([
  "rate-limit",
  "quota",
  "auth",
  "context-overflow",
  "invalid-request",
  "provider",
  "network",
  "empty-response",
]);

export type ModelErrorReason = typeof ModelErrorReason.Type;

/** One failed provider attempt; providers never retry. */
export class ModelError extends Schema.TaggedError<ModelError, { readonly brand: unique symbol }>()(
  "ModelError",
  {
    reason: ModelErrorReason,
    message: Schema.String,
    status: Schema.optional(Schema.Int),
    retryAfter: Schema.optional(Schema.Duration),
    requestId: Schema.optional(Schema.String),
  },
) {}

/** No active provider has the requested id. */
export class ProviderNotFound extends Schema.TaggedError<
  ProviderNotFound,
  { readonly brand: unique symbol }
>()("ProviderNotFound", { provider: Schema.String }) {}

/** US dollars per million tokens. */
export const ModelPrice = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cacheRead: Schema.Finite,
  cacheWrite: Schema.Finite,
});

export const ModelInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  contextWindow: Schema.Int,
  maxOutput: Schema.Int,
  thinking: Schema.Array(ThinkingLevel),
  input: Schema.Array(Schema.Literals(["text", "image"])),
  price: Schema.optional(ModelPrice),
});

export type ModelInfo = typeof ModelInfo.Type;

export const ProviderInfo = Schema.Struct({ id: Schema.String, name: Schema.String });
export type ProviderInfo = typeof ProviderInfo.Type;
