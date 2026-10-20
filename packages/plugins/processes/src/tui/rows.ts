/**
 * How the `process_*` calls read as work rows: `Process start npm run dev (running)`, `Process wait
 * p1 (exited 0)`, `Process write p2`.
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

const rowOf = (call: ToolCall, action: string, target: string): WorkRow => {
  const subject = `${action} ${target}`;

  return Option.match(summaryOf(call), {
    onNone: () => ({ label: "Process", subject, oneLine: true }),
    onSome: (process) => ({ label: "Process", subject, detail: stateWord(process), oneLine: true }),
  });
};

const idRows = (action: string) =>
  ToolRows.Rows({
    fold: (call) =>
      rowOf(
        call,
        action,
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
          "start",
          Option.match(decodeCommand(call.params), {
            onNone: () => "a command",
            onSome: ({ command }) => command,
          }),
        ),
    }),
  ],
  [processTools.wait, idRows("wait")],
  [processTools.read, idRows("read")],
  [processTools.write, idRows("write")],
  [processTools.stop, idRows("stop")],
  [processTools.list, ToolRows.Rows({ fold: () => ({ label: "Process", subject: "list" }) })],
];
