/** `model/list` and `model/details`: models as screens show them. */
import { Effect } from "effect";

import type { Registry } from "@shanepadgett/liminal-core";

import { findModel } from "./call.ts";
import type {
  ModelCatalog,
  ModelDetails,
  ModelId,
  ModelListing,
  ModelProvider,
  Models,
} from "./contract.ts";

const listingOf = (
  provider: ModelProvider,
  model: { readonly id: ModelId; readonly name: string },
  details?: ModelDetails,
): ModelListing => ({
  id: model.id,
  name: model.name,
  provider: provider.name,
  contextWindow: details?.contextWindow,
  thinking: details?.thinking ?? [],
});

/** Every signed-in provider's models, each beside its provider's name. */
export const listAll = (providers: Registry<ModelProvider>, models: Models["Service"]) =>
  Effect.gen(function* () {
    const all = yield* providers.list;
    const listed = yield* models.list;

    return listed.flatMap((model) => {
      const provider = all.find((each) => model.id.startsWith(`${each.id}/`));

      return provider === undefined ? [] : [listingOf(provider, model, model.details)];
    });
  });

/**
 * One model from the catalog, without asking its provider: its provider, its name, which the
 * catalog gives when it can, and its details when the catalog lists it.
 */
export const lookUp = Effect.fn("Models.lookUp")(function* (
  providers: Registry<ModelProvider>,
  catalog: ModelCatalog["Service"],
  id: ModelId,
) {
  const { provider, model } = yield* findModel(providers, id);

  if (provider.catalogId === undefined) return { provider, name: model, details: undefined };

  const listed = yield* catalog.models(provider.catalogId).pipe(
    Effect.catchTag("CatalogUnavailable", (error) =>
      Effect.as(Effect.logWarning(error.message), []),
    ),
    Effect.map((all) => all.find((each) => each.id === model)),
  );

  return { provider, name: listed?.name ?? model, details: listed?.details };
});

/** One model as screens show it, signed in or not. */
export const describe = (
  providers: Registry<ModelProvider>,
  catalog: ModelCatalog["Service"],
  id: ModelId,
) =>
  Effect.map(lookUp(providers, catalog, id), ({ provider, name, details }) =>
    listingOf(provider, { id, name }, details),
  );
