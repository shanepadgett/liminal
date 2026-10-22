/** Model details from models.dev, for providers to add to the models they list. */
import { Context, type Effect, Schema } from "effect";

import type { ModelDetails } from "@shanepadgett/liminal-model/contract";

/** One model models.dev lists, by the id its provider gives it. */
export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly details: ModelDetails;
}

/** Models.dev could not be reached or read, and the cache has no entries for `catalogId`. */
export class CatalogUnavailable extends Schema.TaggedError<
  CatalogUnavailable,
  { readonly brand: unique symbol }
>()("CatalogUnavailable", { catalogId: Schema.String, message: Schema.String }) {}

export class ModelCatalog extends Context.Service<
  ModelCatalog,
  {
    /** The models models.dev lists under `catalogId`, such as `anthropic`. */
    readonly models: (
      catalogId: string,
    ) => Effect.Effect<ReadonlyArray<CatalogModel>, CatalogUnavailable>;
  }
>()("model-catalog/ModelCatalog") {}
