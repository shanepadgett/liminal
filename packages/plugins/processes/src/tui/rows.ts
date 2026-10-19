/**
 * How the `process_*` calls read as work rows: `Started npm run dev (running)`, `Waited on p1
 * (exited 0)`, `Typed into p2`.
 */

import { Match, Option, Schema } from "effect";

import { type ToolCall, ToolRows, type WorkRow } from "@liminal/chat/contract";

import { ProcessSummary, processTools } from "../contract.ts";

const decodeSummary = Schema.decodeUnknownOption(ProcessSummary);
const decodeCommand = Schema.decodeUnknownOption(Schema.Struct({ command: Schema.String }));
const decodeId = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.String }));

/** `running`, `exited 0` or `stopped`. */
export const stateWord = (process: ProcessSummary) =>
  Match.valueTags(process.state, {
    Running: () => "running",
    Exited: ({ code }) => `exited ${code}`,
    Stopped: () => "stopped",
  });

/** The command's summary from a finished call's details. */
export const summaryOf = (call: ToolCall) => decodeSummary(call.outcome?.details);

const rowOf = (call: ToolCall, words: readonly [string, string], subject: string): WorkRow => {
  const verb = call.outcome === undefined ? words[0] : words[1];

  return Option.match(summaryOf(call), {
    onNone: () => ({ verb, subject }),
    onSome: (process) => ({ verb, subject, detail: stateWord(process) }),
  });
};

const idRows = (words: readonly [string, string]) =>
  ToolRows.Rows({
    fold: (call) =>
      rowOf(
        call,
        words,
        Option.match(decodeId(call.params), { onNone: () => "a command", onSome: ({ id }) => id }),
      ),
  });

/** Each tool's rows by name. */
export const processRows: ReadonlyArray<readonly [string, ToolRows]> = [
  [
    processTools.start,
    ToolRows.Rows({
      fold: (call) =>
        rowOf(
          call,
          ["Starting", "Started"],
          Option.match(decodeCommand(call.params), {
            onNone: () => "a command",
            onSome: ({ command }) => command,
          }),
        ),
    }),
  ],
  [processTools.wait, idRows(["Waiting on", "Waited on"])],
  [processTools.read, idRows(["Reading", "Read"])],
  [processTools.write, idRows(["Typing into", "Typed into"])],
  [processTools.stop, idRows(["Stopping", "Stopped"])],
  [
    processTools.list,
    ToolRows.Rows({
      fold: (call) => ({
        verb: call.outcome === undefined ? "Listing" : "Listed",
        subject: "commands",
      }),
    }),
  ],
];
