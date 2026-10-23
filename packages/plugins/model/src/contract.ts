/** The model vocabulary: messages, requests, providers, the model call and one-off calls. */
import { Context, type Effect, Schema, type Stream } from "effect";
import type { AiError, Decision, DecisionModel, LanguageModel, Response } from "effect/ai";
import { Rpc, RpcGroup } from "effect/rpc";

import { Pipeline, Registry } from "@shanepadgett/liminal-core";
import { SettingsInvalid } from "@shanepadgett/liminal-settings/contract";

/** What a provider needs back on the next request, such as a reasoning signature, by provider. */
export const ProviderData = Schema.Record(Schema.String, Schema.Json);
export type ProviderData = typeof ProviderData.Type;

export const Text = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  providerData: Schema.optionalKey(ProviderData),
});

export type Text = typeof Text.Type;

/** A picture, its data in base64, so the log holds what the model saw. */
export const Image = Schema.Struct({
  type: Schema.Literal("image"),
  mediaType: Schema.String,
  data: Schema.String,
});

export type Image = typeof Image.Type;

export const Reasoning = Schema.Struct({
  type: Schema.Literal("reasoning"),
  text: Schema.String,
  providerData: Schema.optionalKey(ProviderData),
});

export type Reasoning = typeof Reasoning.Type;

export const ToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Json,
  providerData: Schema.optionalKey(ProviderData),
});

export type ToolCall = typeof ToolCall.Type;

export const ToolResult = Schema.Struct({
  type: Schema.Literal("tool-result"),
  callId: Schema.String,
  name: Schema.String,
  /** What the model reads; a failure is one text part. */
  content: Schema.Array(Schema.Union([Text, Image])),
  isFailure: Schema.Boolean,
  /** Deferred tools this result loads, by name. */
  loads: Schema.optionalKey(Schema.Array(Schema.String)),
});

export type ToolResult = typeof ToolResult.Type;

export const Part = Schema.Union([Text, Image, Reasoning, ToolCall, ToolResult]);
export type Part = typeof Part.Type;

/** Users send text and images, assistants text, reasoning and tool calls, tools their results. */
export const Message = Schema.Struct({
  role: Schema.Literals(["user", "assistant", "tool"]),
  parts: Schema.Array(Part),
});

export type Message = typeof Message.Type;

/** A tool as the model is told about it; `input` is a JSON Schema for its params. */
export const ToolDefinition = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  input: Schema.JsonObject,
});

export type ToolDefinition = typeof ToolDefinition.Type;

/** `provider/model`, such as `anthropic/claude-opus-5-5`. */
export const ModelId = Schema.String;
export type ModelId = typeof ModelId.Type;

/** A model and its thinking level, named as its provider names it. */
export const ModelChoice = Schema.Struct({
  model: ModelId,
  thinking: Schema.optionalKey(Schema.String),
});

export type ModelChoice = typeof ModelChoice.Type;

/** Dollars per million tokens; the cache prices are set only for a model that caches. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
  readonly cacheRead?: number | undefined;
  readonly cacheWrite?: number | undefined;
}

/** What a model can take and do, from `ModelCatalog`. */
export interface ModelDetails {
  readonly contextWindow: number;
  readonly outputLimit: number;
  /** The thinking levels it takes, such as `off`, `low` and `high`; empty when it does not think. */
  readonly thinking: ReadonlyArray<string>;
  readonly images: boolean;
  readonly toolCalls: boolean;
  readonly structuredOutput: boolean;
  readonly price?: ModelPrice | undefined;
}

export interface ModelInfo {
  readonly id: ModelId;
  readonly name: string;
  /** Missing for a model the catalog does not list yet. */
  readonly details?: ModelDetails | undefined;
}

/** What a catalog model makes: replies, embeddings, images or live audio. */
export type ModelKind = "chat" | "embedding" | "image" | "realtime";

/** The API a model is called through: Anthropic's Messages, OpenAI's Responses or Chat Completions. */
export type Wire = "messages" | "responses" | "chat";

/** One model the catalog lists, by the id its provider gives it. */
export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly kind: ModelKind;
  readonly details: ModelDetails;
  /** Missing when the catalog names an API none of the wires speak. */
  readonly wire?: Wire | undefined;
}

/** The catalog could not be reached or read, and has no entries for `catalogId`. */
export class CatalogUnavailable extends Schema.TaggedError<
  CatalogUnavailable,
  { readonly brand: unique symbol }
>()("CatalogUnavailable", { catalogId: Schema.String, message: Schema.String }) {}

/** Model details by catalog id, which `model` adds to the models providers list. */
export class ModelCatalog extends Context.Service<
  ModelCatalog,
  {
    /** The models the catalog lists under `catalogId`, such as `anthropic`. */
    readonly models: (
      catalogId: string,
    ) => Effect.Effect<ReadonlyArray<CatalogModel>, CatalogUnavailable>;
  }
>()("model/ModelCatalog") {}

/** Asks for the reply as JSON that `schema` decodes. */
export interface StructuredOutput {
  readonly name: string;
  readonly schema: Schema.Codec<unknown, Schema.JsonObject>;
}

export interface ModelRequest {
  readonly model: ModelId;
  readonly thinking?: string | undefined;
  readonly system: string;
  readonly tools: ReadonlyArray<ToolDefinition>;
  readonly messages: ReadonlyArray<Message>;
  /** Missing is `auto`. */
  readonly toolChoice?: "auto" | "none" | "required" | undefined;
  readonly output?: StructuredOutput | undefined;
  /**
   * Requests with the same key share a provider's cache where it routes by key; a turn uses its
   * session's id.
   */
  readonly cacheKey?: string | undefined;
}

/** How a provider sets up a language model for one request. */
export interface LanguageModelOptions {
  readonly thinking?: string | undefined;
  readonly cacheKey?: string | undefined;
  /** Missing when the catalog does not list the model or cannot be read. */
  readonly details?: ModelDetails | undefined;
}

/** A failed attempt that will be tried again; the reply so far is void. */
export const Retrying = Schema.Struct({
  type: Schema.Literal("retry"),
  attempt: Schema.Int,
  attempts: Schema.Int,
  delay: Schema.Duration,
  message: Schema.String,
});

export type Retrying = typeof Retrying.Type;

/** One piece of a streamed reply: Effect AI's response part, or a retry. */
export type ModelDelta = Response.AnyPart | Retrying;

/** A model id whose provider is not composed, or a role no provider can fill. */
export class ModelNotFound extends Schema.TaggedError<
  ModelNotFound,
  { readonly brand: unique symbol }
>()("ModelNotFound", { model: Schema.String, message: Schema.String }) {}

export type ModelCallError = AiError.AiError | ModelNotFound | SettingsInvalid;

/** What a provider plugin adds to `ModelProviders`. */
export interface ModelProvider {
  /** The `provider` in `provider/model`. */
  readonly id: string;
  readonly name: string;
  /**
   * Used when this is the first signed-in provider: `main` for a session no one has picked a model
   * for, `small` for side calls when the `model` setting leaves it unset.
   */
  readonly defaults: { readonly main: ModelChoice; readonly small: ModelChoice };
  /** The catalog id its models' details are under, such as `openai`; missing lists none. */
  readonly catalogId?: string | undefined;
  /** Whether it can sign calls now, with a saved login or a key in the environment. */
  readonly signedIn: Effect.Effect<boolean>;
  /** Its models, without details; `model` adds them from the catalog. */
  readonly models: Effect.Effect<ReadonlyArray<ModelInfo>, AiError.AiError>;
  /** An Effect AI language model for one of its models, without the `provider/` prefix. */
  readonly languageModel: (
    model: string,
    options: LanguageModelOptions,
  ) => Effect.Effect<LanguageModel.LanguageModel, AiError.AiError>;
  /** The classifiers its current login can call; missing when it offers none. */
  readonly classifiers?: Effect.Effect<ReadonlyArray<ModelInfo>, AiError.AiError> | undefined;
  /** An Effect AI decision model for one of its classifiers, without the `provider/` prefix. */
  readonly decisionModel?:
    | ((model: string) => Effect.Effect<DecisionModel.DecisionModel, AiError.AiError>)
    | undefined;
}

export class ModelProviders extends Registry.Service<ModelProviders, ModelProvider>()(
  "model/ModelProviders",
) {}

/** Every model call; retries are inside, so a wrap sees each request once. */
export class ModelCall extends Pipeline.Service<
  ModelCall,
  ModelRequest,
  Stream.Stream<ModelDelta, ModelCallError>
>()("model/ModelCall") {}

export interface GenerateOptions {
  /** `small` or a model id; missing is the prefix's model, or `small`. */
  readonly model?: string | undefined;
  /** The request to start from, such as `Turns.request(id)`, so the call shares its cache. */
  readonly prefix?: ModelRequest | undefined;
  /** Sent as a user message after the prefix. */
  readonly prompt: ReadonlyArray<Part>;
}

export interface ClassifyOptions<
  Input extends Schema.Constraint,
> extends DecisionModel.DecideOptions<Input> {
  /** A classifier's model id; missing picks one. */
  readonly model?: ModelId | undefined;
}

/** A reply being built from its deltas, its parts in the order they started. */
export type Reply = ReadonlyArray<{
  readonly key: string;
  readonly part: Text | Reasoning | ToolCall;
}>;

type Building = Reply[number]["part"];

const isFields = Schema.is(Schema.JsonObject);

const isJson = Schema.is(Schema.Json);

/**
 * `later` over `earlier`, merging each provider's fields: a part's start, deltas and end each carry
 * some.
 */
const mergeData = (
  earlier: ProviderData | undefined,
  later: Response.ProviderMetadata,
): ProviderData | undefined => {
  const merged: Record<string, Schema.Json> = { ...earlier };

  for (const [provider, value] of Object.entries(later)) {
    const before = merged[provider];

    merged[provider] =
      isFields(before) && isFields(value) ? Object.assign({}, before, value) : value;
  }

  return Object.keys(merged).length === 0 ? undefined : merged;
};

const withData = <P extends Building>(part: P, data: ProviderData | undefined): P =>
  data === undefined ? part : { ...part, providerData: data };

const update = (reply: Reply, key: string, metadata: Response.ProviderMetadata, text = ""): Reply =>
  reply.map((building) => {
    if (building.key !== key) return building;

    const { part } = building;
    const grown = part.type === "tool-call" ? part : { ...part, text: part.text + text };

    return { key, part: withData(grown, mergeData(part.providerData, metadata)) };
  });

/** Text and reasoning: each starts, grows by deltas and ends. */
const addText = (reply: Reply, delta: Response.AnyPart): Reply => {
  if (delta.type === "text-start" || delta.type === "reasoning-start") {
    const type = delta.type === "text-start" ? "text" : "reasoning";
    const part = withData({ type, text: "" }, mergeData(undefined, delta.metadata));

    return [...reply, { key: `${type}:${delta.id}`, part }];
  }

  if (delta.type === "text-delta" || delta.type === "reasoning-delta") {
    const type = delta.type === "text-delta" ? "text" : "reasoning";

    return update(reply, `${type}:${delta.id}`, delta.metadata, delta.delta);
  }

  if (delta.type === "text-end" || delta.type === "reasoning-end") {
    const type = delta.type === "text-end" ? "text" : "reasoning";

    return update(reply, `${type}:${delta.id}`, delta.metadata);
  }

  return reply;
};

/** A tool call arrives whole; one the provider ran itself is left out. */
const addCall = (reply: Reply, delta: Extract<ModelDelta, { type: "tool-call" }>): Reply => {
  if (delta.providerExecuted) return reply;

  const { id, metadata } = delta;
  const name = String(delta.name);
  const params: unknown = delta.params;
  const call: ToolCall = { type: "tool-call", id, name, params: isJson(params) ? params : null };

  return [
    ...reply,
    { key: `tool-call:${id}`, part: withData(call, mergeData(undefined, metadata)) },
  ];
};

/** `reply` with `delta` added; a retry starts it over. */
const add = (reply: Reply, delta: ModelDelta): Reply => {
  if (delta.type === "retry") return [];
  if (delta.type === "tool-call") return addCall(reply, delta);

  return addText(reply, delta);
};

const empty: Reply = [];

export const Reply = {
  empty,
  add,
  message: (reply: Reply): Message => ({ role: "assistant", parts: reply.map(({ part }) => part) }),
};

/** A model as a screen shows it. */
export const ModelListing = Schema.Struct({
  id: ModelId,
  name: Schema.String,
  /** Its provider's name, such as `Anthropic`. */
  provider: Schema.String,
  /** Missing when the catalog does not list the model or cannot be read. */
  contextWindow: Schema.optional(Schema.Int),
  /** The thinking levels it takes; empty when it does not think or the catalog does not say. */
  thinking: Schema.Array(Schema.String),
});

export type ModelListing = typeof ModelListing.Type;

/** What screens call. */
export class ModelRpc extends RpcGroup.make(
  /** The models of every signed-in provider. */
  Rpc.make("model/list", { success: Schema.Array(ModelListing) }),
  /** One model, signed in or not. */
  Rpc.make("model/details", {
    payload: { model: ModelId },
    success: ModelListing,
    error: ModelNotFound,
  }),
) {}

export class Models extends Context.Service<
  Models,
  {
    /**
     * The model `small` or a model id names; `small` comes from the `model` setting, else the first
     * signed-in provider's default.
     */
    readonly resolve: (
      model: string,
    ) => Effect.Effect<ModelChoice, ModelNotFound | SettingsInvalid>;
    /** The models of every signed-in provider; a provider whose list fails is logged and left out. */
    readonly list: Effect.Effect<ReadonlyArray<ModelInfo>>;
    /** One model call outside the turn loop, through `ModelCall`; the reply is not logged. */
    readonly generate: (options: GenerateOptions) => Effect.Effect<Message, ModelCallError>;
    /** `generate` whose reply is JSON that `schema` decodes; an object at the top. */
    readonly generateObject: <T>(
      options: GenerateOptions & { readonly schema: Schema.Codec<T, Schema.JsonObject> },
    ) => Effect.Effect<T, ModelCallError>;
    /**
     * Answers `definition`'s decisions about `input` in one call with no retries; the model is
     * `model`, else the `classifier` setting, else the first classifier a signed-in provider
     * lists.
     */
    readonly classify: <
      Input extends Schema.Constraint,
      Decisions extends Record<string, Decision.Any>,
    >(
      definition: Decision.Definition<Input, Decisions>,
      options: ClassifyOptions<Input>,
    ) => Effect.Effect<
      DecisionModel.DecideResponse<Decisions>,
      ModelCallError,
      Input["EncodingServices"]
    >;
  }
>()("model/Models") {}
