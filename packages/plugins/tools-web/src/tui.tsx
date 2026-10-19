/**
 * Web tools' TUI part: a search reads as `Searched the web <query>` with its source count, a fetch
 * as `Fetched <url>`; an opened row shows the end of the result.
 */

import { Effect, Option, Predicate, Schema } from "effect";

import { ChatSlots, type ToolCall, ToolRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { FetchParams, SearchParams } from "./contract.ts";

const decodeSearch = Schema.decodeUnknownOption(SearchParams);
const decodeFetch = Schema.decodeUnknownOption(FetchParams);

/** How many sources a finished search listed, from its `- [title](url)` lines. */
const sourcesOf = (call: ToolCall) => {
  const result = call.outcome?.status === "done" ? call.outcome.result : null;
  if (!Predicate.isString(result)) return "";

  const count = result.split("\n").filter((line) => line.startsWith("- [")).length;

  return count === 0 ? "" : `${count} ${count === 1 ? "source" : "sources"}`;
};

const searchRows = ToolRows.Rows({
  fold: (call) => ({
    verb: call.outcome === undefined ? "Searching the web" : "Searched the web",
    subject: Option.match(decodeSearch(call.params), {
      onNone: () => "",
      onSome: ({ query }) => query,
    }),
    detail: sourcesOf(call),
  }),
});

const fetchRows = ToolRows.Rows({
  fold: (call) => ({
    verb: call.outcome === undefined ? "Fetching" : "Fetched",
    subject: Option.match(decodeFetch(call.params), { onNone: () => "", onSome: ({ url }) => url }),
  }),
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: "websearch", meta: searchRows }, Tail);
    yield* host.register(ChatSlots.tool, { key: "webfetch", meta: fetchRows }, Tail);
  }),
});
