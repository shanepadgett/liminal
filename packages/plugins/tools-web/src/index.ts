/** The `websearch` and `webfetch` tools, and the registry of hosted searchers. */
import { Effect, Layer } from "effect";
import { HttpClient } from "effect/http";

import { definePlugin, Registry } from "@shanepadgett/liminal-core";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import { type WebSearcher, WebSearchers } from "./contract.ts";
import { makeFetch } from "./fetch.ts";
import { makeSearch } from "./search.ts";

const tools = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* Tools;
    yield* registry.add(yield* makeSearch);
    yield* registry.add(yield* makeFetch);
  }),
);

export default definePlugin({
  name: "tools-web",
  provides: [WebSearchers],
  requires: [Tools, SessionLog, HttpClient.HttpClient],
  layer: tools.pipe(Layer.provideMerge(Layer.effect(WebSearchers, Registry.make<WebSearcher>()))),
  entries: { tui: () => import("./tui/index.tsx") },
});
