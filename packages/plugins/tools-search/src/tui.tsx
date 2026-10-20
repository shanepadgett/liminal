/**
 * Tool search's TUI part: a search reads as `Tool search <query>`, with the tools it loaded as
 * detail, or `none found`.
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
    const subject = queryOf(call);
    if (call.outcome === undefined) return { label: "Tool search", subject };

    const loaded = loadedOf(call);

    return {
      label: "Tool search",
      subject,
      detail: loaded.length === 0 ? "none found" : `loaded ${loaded.join(", ")}`,
    };
  },
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: toolSearchTool, meta: searchRows }, Tail);
  }),
});
