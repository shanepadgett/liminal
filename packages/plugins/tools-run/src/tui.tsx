/**
 * The run tool's TUI part: a `run` call reads as `Ran <first line of the script>`, cut to one row,
 * with how many calls it made, and an opened row shows the script and the tail of its output.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, type ToolCall, ToolRows, type ToolView } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost, useColor } from "@liminal/sdk/tui";

import { RunParams } from "./contract.ts";

const decodeParams = Schema.decodeUnknownOption(RunParams);

const codeOf = (call: ToolCall) =>
  Option.match(decodeParams(call.params), { onNone: () => "", onSome: ({ code }) => code });

const firstLine = (code: string) =>
  code
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "";

const callsOf = (call: ToolCall) => {
  const count = call.inner?.length ?? 0;

  return count === 0 ? "" : `${count} ${count === 1 ? "call" : "calls"}`;
};

const fold = (call: ToolCall) => ({
  verb: call.outcome === undefined ? "Running" : "Ran",
  subject: firstLine(codeOf(call)),
  detail: callsOf(call),
  oneLine: true,
});

function Script(props: ToolView) {
  const color = useColor();

  return (
    <box flexDirection="column">
      <text fg={color("text.faint")}>{codeOf(props.call)}</text>
      <Tail text={props.text} lines={12} />
    </box>
  );
}

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: "run", meta: ToolRows.Rows({ fold }) }, Script);
  }),
});
