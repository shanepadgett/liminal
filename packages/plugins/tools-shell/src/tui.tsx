/**
 * The shell tool's TUI part: a `shell` call reads as `Ran <command>`, and an opened row shows the
 * tail of its output.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, type ToolCall, ToolRows, type ToolView } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

import { ShellParams } from "./contract.ts";

const decodeParams = Schema.decodeUnknownOption(ShellParams);

/** The command's first line; the rest shows when the row opens. */
const commandOf = (call: ToolCall) =>
  Option.match(decodeParams(call.params), {
    onNone: () => "",
    onSome: ({ command }) => command.split("\n")[0] ?? "",
  });

const fold = (call: ToolCall) => ({
  verb: call.outcome === undefined ? "Running" : "Ran",
  subject: commandOf(call),
});

function Output(props: ToolView) {
  return <Tail text={props.text} lines={12} />;
}

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: "shell", meta: ToolRows.Rows({ fold }) }, Output);
  }),
});
