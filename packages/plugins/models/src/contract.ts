/** Models: the registry providers join and the service that routes each call to one. */

import { Context, Data, type Effect, type Option, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  CatalogUnavailable,
  KeyedRegistry,
  ModelError,
  type ModelEvent,
  ModelInfo,
  type ModelRef,
  type ModelRequest,
  ProviderNotFound,
  ProviderInfo,
} from "@liminal/sdk";

/** A model an account's plan offers; its context window, when given, wins over the catalog's. */
export interface PlanModel {
  readonly id: string;
  readonly contextWindow: Option.Option<number>;
}

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
  }
>()("liminal/models/Models") {}

/** Models' commands for frontends: the active providers and each one's models. */
export class ModelsRpcs extends RpcGroup.make(
  Rpc.make("models/providers", { success: Schema.Array(ProviderInfo) }),
  Rpc.make("models/list", {
    payload: { provider: Schema.String },
    success: Schema.Array(ModelInfo),
    error: Schema.Union([ModelError, ProviderNotFound, CatalogUnavailable]),
  }),
) {}
