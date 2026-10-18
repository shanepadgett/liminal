/**
 * What the model sees and the seam every provider plugs into, in Liminal's own Schemas, so an
 * Effect upgrade cannot break saved sessions.
 */

import { type Option, Schema } from "effect";

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
  /** In user messages only: offers or withdraws a tool from this point on. */
  Schema.Struct({
    type: Schema.Literal("tool-change"),
    change: Schema.Literals(["offer", "withdraw"]),
    tool: ToolSpec,
  }),
]);

export type ModelPart = typeof ModelPart.Type;

/** The cached prefix ends after the message that carries it; a provider without caching ignores it. */
export const CacheMark = Schema.Literal("breakpoint");

export type CacheMark = typeof CacheMark.Type;

export const ModelContent = Schema.Struct({
  role: Schema.Literals(["system", "user", "assistant", "tool"]),
  parts: Schema.Array(ModelPart),
  /** Set on the request only, by request steps; saved entries never carry it. */
  cache: Schema.optionalKey(CacheMark),
});

export type ModelContent = typeof ModelContent.Type;

/** A model by its provider and the provider's id for it. */
export const ModelRef = Schema.Struct({ provider: Schema.String, id: Schema.String });
export type ModelRef = typeof ModelRef.Type;

export const ThinkingOff = Schema.TaggedStruct("Off", {});
export const ThinkingOn = Schema.TaggedStruct("On", {});

/** An effort as the provider names it, such as `low`, `xhigh` or `max`. */
export const ThinkingEffort = Schema.TaggedStruct("Effort", { effort: Schema.String });

/** A token budget for thinking. */
export const ThinkingBudget = Schema.TaggedStruct("Budget", { tokens: Schema.Int });

/** What a request asks of the model's thinking, in the terms its provider takes. */
export const ThinkingValue = Schema.Union([
  ThinkingOff,
  ThinkingOn,
  ThinkingEffort,
  ThinkingBudget,
]);

export type ThinkingValue = typeof ThinkingValue.Type;

/** One thinking choice a model offers, named as its provider names it. */
export const ThinkingOption = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  value: ThinkingValue,
});

export type ThinkingOption = typeof ThinkingOption.Type;

/** A tool declared on the request; one not offered at the start waits for a `tool-change` offer. */
export const ModelTool = Schema.Struct({ ...ToolSpec.fields, offered: Schema.Boolean });
export type ModelTool = typeof ModelTool.Type;

/** Which tools the model may call: any or none, at least one, or the named one. */
export const ToolChoice = Schema.Union([
  Schema.Literals(["auto", "required"]),
  Schema.Struct({ tool: Schema.String }),
]);

export type ToolChoice = typeof ToolChoice.Type;

/** A provider's cheap model and the thinking it runs with, for short side calls. */
export const CheapModel = Schema.Struct({ model: ModelRef, thinking: ThinkingValue });

export type CheapModel = typeof CheapModel.Type;

export const ModelRequest = Schema.Struct({
  model: ModelRef,
  messages: Schema.Array(ModelContent),
  tools: Schema.Array(ModelTool),
  /** Missing is `auto`. */
  toolChoice: Schema.optionalKey(ToolChoice),
  thinking: ThinkingValue,
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

/**
 * The model catalog cannot list `catalogId`: it could not be fetched and is not cached, or it does
 * not exist.
 */
export class CatalogUnavailable extends Schema.TaggedError<
  CatalogUnavailable,
  { readonly brand: unique symbol }
>()("CatalogUnavailable", { catalogId: Schema.String, message: Schema.String }) {}

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
  /** The model's thinking choices; empty when it cannot think or its thinking cannot be set. */
  thinking: Schema.Array(ThinkingOption),
  /**
   * The option used when none is chosen or the chosen one is not offered; set when `thinking` is
   * not empty.
   */
  defaultThinking: Schema.optional(Schema.String),
  input: Schema.Array(Schema.Literals(["text", "image"])),
  price: Schema.optional(ModelPrice),
});

export type ModelInfo = typeof ModelInfo.Type;

/** A model an account's plan offers; its context window, when given, wins over the catalog's. */
export interface PlanModel {
  readonly id: string;
  readonly contextWindow: Option.Option<number>;
}

/** `medium` when offered, else the middle option. */
export const defaultThinkingOf = (options: ReadonlyArray<ThinkingOption>) =>
  (options.find((option) => option.id === "medium") ?? options[Math.floor(options.length / 2)])?.id;

/**
 * The option `id` names when `info` offers it, else the model's default; `undefined` when it offers
 * none.
 */
export const thinkingOptionOf = (info: ModelInfo, id: string | undefined) =>
  info.thinking.find((option) => option.id === id)
  ?? info.thinking.find((option) => option.id === info.defaultThinking);

export const ProviderInfo = Schema.Struct({ id: Schema.String, name: Schema.String });
export type ProviderInfo = typeof ProviderInfo.Type;
