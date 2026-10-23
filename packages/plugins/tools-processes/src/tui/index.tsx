/** `process_start`'s `tui` entry: its transcript row, labelled by the call's description. */
import { Effect, Layer, Option, Schema } from "effect";

import { type ToolRowProps, ToolRows, WorkRow } from "@shanepadgett/liminal-chat/tui";
import { definePlugin } from "@shanepadgett/liminal-core";

import { processStartName } from "../contract.ts";

/** The params as far as the model has written them. */
const decodeWritten = Schema.decodeUnknownOption(
  Schema.Struct({
    command: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.String),
  }),
);

/** The description, or the command until the description comes. */
const labelOf = (params: ToolRowProps["item"]["params"]) =>
  Option.match(decodeWritten(params), {
    onNone: () => "",
    onSome: ({ command, description }) => description || command || "",
  });

function StartRow(props: ToolRowProps) {
  return <WorkRow item={{ ...props.item, params: { description: labelOf(props.item.params) } }} />;
}

const make = Effect.gen(function* () {
  yield* (yield* ToolRows).add({ tool: processStartName, component: StartRow });
});

export default definePlugin({
  name: "tools-processes-tui",
  provides: [],
  requires: [ToolRows],
  layer: Layer.effectDiscard(make),
});
