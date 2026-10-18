/**
 * The file tools' TUI part: words `read`, `write` and `edit` calls as work rows. Reads join into
 * `Explored N files`; writes and edits into `Edited N files`. An opened row shows the result.
 */

import { Effect, Option, Schema } from "effect";

import { ChatSlots, type ToolCall, type ToolRows, type WorkRow } from "@liminal/chat/contract";
import { defineTui, Tail, TuiHost } from "@liminal/sdk/tui";

const Path = Schema.Struct({ path: Schema.String });

const decodePath = Schema.decodeUnknownOption(Path);

const pathOf = (call: ToolCall) =>
  Option.match(decodePath(call.params), { onNone: () => "", onSome: ({ path }) => path });

const explored = { verb: "Explored", noun: "files" };
const edited = { verb: "Edited", noun: "files" };

const rowOf =
  (running: string, done: string, joins: NonNullable<WorkRow["joins"]>) =>
  (call: ToolCall): WorkRow => ({
    verb: call.outcome === undefined ? running : done,
    subject: pathOf(call),
    joins,
  });

/** A result that is not text, such as a failure's details, shows nothing. */
const decodeText = Schema.decodeUnknownOption(Schema.String);

function Result(props: { readonly call: ToolCall }) {
  const text = () => Option.getOrElse(decodeText(props.call.outcome?.result), () => "");

  return <Tail text={text()} lines={8} />;
}

export default defineTui({
  setup: Effect.gen(function* () {
    const host = yield* TuiHost;

    const tools: ReadonlyArray<readonly [string, ToolRows["fold"]]> = [
      ["read", rowOf("Reading", "Read", explored)],
      ["write", rowOf("Writing", "Wrote", edited)],
      ["edit", rowOf("Editing", "Edited", edited)],
    ];

    for (const [key, fold] of tools) {
      yield* host.register(ChatSlots.tool, { key, meta: { fold } }, Result);
    }
  }),
});
