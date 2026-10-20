/**
 * Tool search's TUI part: a search reads as `Loaded <names>`, or `Searched tools <query>` with
 * none.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, type ToolCall, ToolRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { SearchDetails, SearchParams, toolSearchTool } from "./contract.ts";

const decodeParams = Schema.decodeUnknownOption(SearchParams);
const decodeDetails = Schema.decodeUnknownOption(SearchDetails);

/** The tools a finished search loaded; none while it runs or when it failed. */
const loadedOf = (call: ToolCall): ReadonlyArray<string> =>
  call.outcome?.status === "done"
    ? Option.match(decodeDetails(call.outcome.details), {
        onNone: () => [],
        onSome: ({ loaded }) => loaded,
      })
    : [];

const queryOf = (call: ToolCall) =>
  Option.match(decodeParams(call.params), { onNone: () => "", onSome: ({ query }) => query });

const searchRows = ToolRows.Rows({
  fold: (call) => {
    if (call.outcome === undefined) return { verb: "Searching tools", subject: queryOf(call) };

    const loaded = loadedOf(call);

    return loaded.length === 0
      ? { verb: "Searched tools", subject: queryOf(call), detail: "none found" }
      : { verb: "Loaded", subject: loaded.join(", ") };
  },
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: toolSearchTool, meta: searchRows }, Tail);
  }),
});
