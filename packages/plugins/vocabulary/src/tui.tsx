/**
 * Vocabulary's TUI part: a call reads as `Read vocabulary`, `Saved term <name>` or `Removed term
 * <name>`; an opened row shows the end of the result.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { VocabularyParams, vocabularyTool } from "./contract.ts";

const decodeParams = Schema.decodeUnknownOption(VocabularyParams);

const rows = ToolRows.Rows({
  fold: (call) => {
    const isRunning = call.outcome === undefined;

    return Option.match(decodeParams(call.params), {
      onNone: () => ({ verb: isRunning ? "Using" : "Used", subject: "vocabulary" }),
      onSome: ({ op, term }) => {
        if (op === "get")
          return { verb: isRunning ? "Reading" : "Read", subject: term ?? "vocabulary" };

        if (op === "set")
          return { verb: isRunning ? "Saving term" : "Saved term", subject: term ?? "" };

        return { verb: isRunning ? "Removing term" : "Removed term", subject: term ?? "" };
      },
    });
  },
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: vocabularyTool, meta: rows }, Tail);
  }),
});
