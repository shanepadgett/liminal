/** Model-catalog: model details from models.dev, kept in a cache file and refreshed daily. */

import { Context, type Effect, type Option } from "effect";

import type { CatalogUnavailable, ModelInfo } from "@liminal/sdk";

/** One model models.dev lists. */
export interface CatalogModel {
  readonly info: ModelInfo;
  /**
   * Models.dev's `provider.npm`, the AI SDK package of the protocol the model uses; set only when
   * it differs from its provider's.
   */
  readonly package: Option.Option<string>;
}

export class ModelCatalog extends Context.Service<
  ModelCatalog,
  {
    /** The tool-calling models models.dev lists under `catalogId`; fetches when the cache lacks it. */
    readonly models: (
      catalogId: string,
    ) => Effect.Effect<ReadonlyArray<CatalogModel>, CatalogUnavailable>;
  }
>()("liminal/model-catalog/ModelCatalog") {}
