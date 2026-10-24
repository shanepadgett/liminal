/** OpenAI's hosted web search for sessions on OpenAI and Codex models. */
import { Effect, Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { hostedSearch, responsesSearch } from "@shanepadgett/liminal-model-wire/search";
import { ModelProviders } from "@shanepadgett/liminal-model/contract";
import { SearchFailed, WebSearchers } from "@shanepadgett/liminal-tools-web/contract";

/** The providers whose sessions search with OpenAI. */
const covered = ["openai", "codex"];

const register = Effect.gen(function* () {
  const { list } = yield* ModelProviders;
  const searchers = yield* WebSearchers;

  yield* Effect.forEach(covered, (id) =>
    searchers.add({
      provider: id,
      name: "OpenAI",
      search: (query) =>
        hostedSearch(list, id, responsesSearch, query).pipe(
          Effect.mapError(({ message }) => new SearchFailed({ message })),
        ),
    }),
  );
});

export default definePlugin({
  name: "web-search-openai",
  provides: [],
  requires: [ModelProviders, WebSearchers],
  layer: Layer.effectDiscard(register),
});
