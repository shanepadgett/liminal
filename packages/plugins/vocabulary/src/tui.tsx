/**
 * Vocabulary's TUI part: a call reads as `Vocabulary get <term>`, `Vocabulary set <term>` or
 * `Vocabulary remove <term>`; an opened row shows the end of the result.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, ToolRows } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { VocabularyParams, vocabularyTool } from "./contract.ts";

const decodeParams = Schema.decodeUnknownOption(VocabularyParams);

const rows = ToolRows.Rows({
  fold: (call) => {
    return Option.match(decodeParams(call.params), {
      onNone: () => ({ label: "Vocabulary", subject: "" }),
      onSome: ({ op, term }) => ({ label: "Vocabulary", subject: `${op} ${term ?? ""}`.trim() }),
    });
  },
});

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: vocabularyTool, meta: rows }, Tail);
  }),
});
