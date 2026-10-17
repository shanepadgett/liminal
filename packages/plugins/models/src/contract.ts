/** Models: the registry providers join and the service that routes each call to one. */

import { Context, type Effect, Schema, type Stream } from "effect";

import {
  KeyedRegistry,
  type ModelError,
  type ModelEvent,
  type ModelInfo,
  type ModelRequest,
  type ProviderInfo,
} from "@liminal/sdk";

export class ProviderNotFound extends Schema.TaggedError<
  ProviderNotFound,
  { readonly brand: unique symbol }
>()("ProviderNotFound", { provider: Schema.String }) {}

/** What a provider plugin registers. */
export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly models: Effect.Effect<ReadonlyArray<ModelInfo>, ModelError>;
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
    readonly listModels: (
      provider: string,
    ) => Effect.Effect<ReadonlyArray<ModelInfo>, ModelError | ProviderNotFound>;
  }
>()("liminal/models/Models") {}
