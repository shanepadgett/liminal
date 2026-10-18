/**
 * The shell tool's TUI part: a `shell` call reads as `Ran <command>`, and an opened row shows the
 * tail of its output.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, type ToolCall } from "@liminal/chat/contract";
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

/** A result that is not text, such as a failure's details, shows nothing. */
const decodeText = Schema.decodeUnknownOption(Schema.String);

function Output(props: { readonly call: ToolCall }) {
  const output = () => Option.getOrElse(decodeText(props.call.outcome?.result), () => "");

  return <Tail text={output()} lines={12} />;
}

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    yield* host.register(ChatSlots.tool, { key: "shell", meta: { fold } }, Output);
  }),
});
