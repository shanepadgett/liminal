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

/** One model from the catalog, without asking its provider; the catalog names it when it can. */
export const describe = Effect.fn("ModelRpc.details")(function* (
  providers: Registry<ModelProvider>,
  catalog: ModelCatalog["Service"],
  id: ModelId,
) {
  const { provider, model } = yield* findModel(providers, id);

  if (provider.catalogId === undefined) {
    return listingOf(provider, { id, name: model });
  }

  const listed = yield* catalog.models(provider.catalogId).pipe(
    Effect.catchTag("CatalogUnavailable", (error) =>
      Effect.as(Effect.logWarning(error.message), []),
    ),
    Effect.map((all) => all.find((each) => each.id === model)),
  );

  return listingOf(provider, { id, name: listed?.name ?? model }, listed?.details);
});
