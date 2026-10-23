/** Anthropic's hosted web search for sessions on Anthropic models. */
import { Effect, Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { hostedSearch, messagesSearch } from "@shanepadgett/liminal-model-wire/search";
import { ModelProviders } from "@shanepadgett/liminal-model/contract";
import { SearchFailed, WebSearchers } from "@shanepadgett/liminal-tools-web/contract";

const search = (providers: ModelProviders["Service"]) => (query: string) =>
  hostedSearch(providers.list, "anthropic", messagesSearch, query).pipe(
    Effect.mapError(({ message }) => new SearchFailed({ message })),
  );

export default definePlugin({
  name: "web-search-anthropic",
  provides: [],
  requires: [WebSearchers, ModelProviders],
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const providers = yield* ModelProviders;

      yield* (yield* WebSearchers).add({
        provider: "anthropic",
        name: "Claude",
        search: search(providers),
      });
    }),
  ),
});
