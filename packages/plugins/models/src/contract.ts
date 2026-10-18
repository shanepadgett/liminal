/** Models: the registry providers join and the service that routes each call to one. */

import { Context, Data, type Effect, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  CatalogUnavailable,
  KeyedRegistry,
  type ModelContent,
  ModelError,
  type ModelEvent,
  ModelInfo,
  type ModelPick,
  type ModelRef,
  type PlanModel,
  type ModelRequest,
  ProviderNotFound,
  ProviderInfo,
  type SessionId,
  type ThinkingValue,
  type Tool,
} from "@liminal/sdk";

/** Where a provider's models come from. */
export type ModelSource = Data.TaggedEnum<{
  /** A fixed list, such as a test provider's or a local server's. */
  Listed: { readonly models: Effect.Effect<ReadonlyArray<ModelInfo>, ModelError> };
  /** Every model the catalog lists under `catalogId`. */
  Catalog: { readonly catalogId: string };
  /** The catalog's models that the account's plan offers, the plan read on each listing. */
  PlanCatalog: {
    readonly catalogId: string;
    readonly plan: Effect.Effect<ReadonlyArray<PlanModel>, ModelError>;
  };
}>;

export const ModelSource = Data.taggedEnum<ModelSource>();

/** What a provider plugin registers. */
export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly source: ModelSource;
  /**
   * Fails with an `auth` ModelError while the provider has no usable login, such as no API key;
   * listing its models checks it first. Providers without a login leave it out.
   */
  readonly checkLogin?: Effect.Effect<void, ModelError>;
  /** One attempt; accepts model ids `models` does not list; interruption cancels the call. */
  readonly stream: (request: ModelRequest) => Stream.Stream<ModelEvent, ModelError>;
  /** Whether `tool-change` parts become native items; otherwise every declared tool is sent. */
  readonly nativeToolChanges: boolean;
  /** The model and thinking for short side calls, such as reviews. */
  readonly cheap: { readonly id: string; readonly thinking: ThinkingValue };
}

/** The active providers by id; each provider plugin registers one in its server's scope. */
export class ModelProviders extends KeyedRegistry.Service<ModelProviders, ModelProvider>()(
  "liminal/models/ModelProviders",
) {}

export class Models extends Context.Service<
  Models,
  {
    /** Streams `request` through its model's provider. */
    readonly stream: (
      request: ModelRequest,
    ) => Stream.Stream<ModelEvent, ModelError | ProviderNotFound>;
    readonly listProviders: Effect.Effect<ReadonlyArray<ProviderInfo>>;
    /** The provider's models; a plan is read again on each call. */
    readonly listModels: (
      provider: string,
    ) => Effect.Effect<
      ReadonlyArray<ModelInfo>,
      ModelError | ProviderNotFound | CatalogUnavailable
    >;
    /** One model's details, without reading a plan. */
    readonly describe: (
      model: ModelRef,
    ) => Effect.Effect<ModelInfo, ModelError | ProviderNotFound | CatalogUnavailable>;
    /** The provider's preferred small model, a default for side calls. */
    readonly cheap: (provider: string) => Effect.Effect<ModelPick, ProviderNotFound>;
  }
>()("liminal/models/Models") {}

/** A task ended without a valid answer. */
export class TaskFailed extends Schema.TaggedError<TaskFailed, { readonly brand: unique symbol }>()(
  "TaskFailed",
  { message: Schema.String },
) {}

/** The tool a task's model calls to give its answer, its params checked by `schema`. */
export interface TaskSubmit<S extends Schema.Top> {
  readonly name: string;
  readonly description: string;
  readonly schema: S;
}

/** One bounded exchange that ends when the model submits a typed answer. */
export interface TaskRequest<S extends Schema.Top> {
  /** Any model; `Models.cheap` gives the provider's small one. */
  readonly model: ModelPick;
  /** Passed to each tool run. */
  readonly sessionId: SessionId;
  readonly system: string;
  readonly prompt: ReadonlyArray<ModelContent>;
  /** Tools the model may call before it submits; each runs as given. */
  readonly tools: ReadonlyArray<Tool>;
  readonly submit: TaskSubmit<S>;
  /** Model calls at most; the last one must submit. */
  readonly maxSteps: number;
}

/** Runs short side calls that return one typed answer. */
export class ModelTask extends Context.Service<
  ModelTask,
  {
    readonly run: <S extends Schema.Top & { readonly DecodingServices: never }>(
      request: TaskRequest<S>,
    ) => Effect.Effect<S["Type"], TaskFailed | ModelError | ProviderNotFound>;
  }
>()("liminal/models/ModelTask") {}

/** Models' commands for frontends: the active providers and each one's models. */
export class ModelsRpcs extends RpcGroup.make(
  Rpc.make("models/providers", { success: Schema.Array(ProviderInfo) }),
  Rpc.make("models/list", {
    payload: { provider: Schema.String },
    success: Schema.Array(ModelInfo),
    error: Schema.Union([ModelError, ProviderNotFound, CatalogUnavailable]),
  }),
) {}
