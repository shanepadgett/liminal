/**
 * The execute tool's TUI part: an `execute` call reads as `Execute`, with the calls it made listed
 * under it; an opened row shows the script and the tail of its output.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, type ToolCall, ToolRows, type ToolView } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost, useColor } from "@liminal/sdk/tui";

import { ExecuteScript } from "./contract.ts";

const decodeParams = Schema.decodeUnknownOption(ExecuteScript);

const codeOf = (call: ToolCall) =>
  Option.match(decodeParams(call.params), { onNone: () => "", onSome: ({ code }) => code });

const fold = () => ({ label: "Execute", subject: "" });

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

    yield* host.register(ChatSlots.tool, { key: "execute", meta: ToolRows.Rows({ fold }) }, Script);
  }),
});
