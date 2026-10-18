/** Model-catalog: model details from models.dev, kept in a cache file and refreshed daily. */

import { Context, type Effect } from "effect";

import type { CatalogUnavailable, ModelInfo } from "@liminal/sdk";

export class ModelCatalog extends Context.Service<
  ModelCatalog,
  {
    /** The tool-calling models models.dev lists under `catalogId`; fetches when the cache lacks it. */
    readonly models: (
      catalogId: string,
    ) => Effect.Effect<ReadonlyArray<ModelInfo>, CatalogUnavailable>;
  }
>()("liminal/model-catalog/ModelCatalog") {}
