/**
 * The `history` tool: the entries a note or memory stands for, as the transcript the note writer
 * read, so the model can recall exact details after a checkpoint.
 */

import { Effect } from "effect";

import { defineTool, Seq, ToolFailed } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import { HistoryParams, historyTool } from "../contract.ts";
import { historyText } from "./notes.ts";

export const historyToolOf = (log: SessionLog["Service"]) =>
  defineTool({
    name: historyTool,
    description:
      "Reads the saved entries from `from` through `through`, inclusive, as a transcript: user and assistant messages, tool calls and tool results.",
    parameters: HistoryParams,
    guidance: [
      "After a checkpoint, use `history` with the entry numbers a memory names to recall exact details it left out.",
    ],
    hints: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    runAlongside: true,
    safeToRerun: true,
    run: ({ from, through }, { sessionId }) =>
      Effect.gen(function* () {
        if (through < from)
          return yield* new ToolFailed({ message: "`through` must not come before `from`." });

        const entries = yield* log
          .read(sessionId, { after: Seq.make(from - 1), through: Seq.make(through) })
          .pipe(Effect.mapError((error) => new ToolFailed({ message: error.message })));

        const text = historyText(entries);

        return { result: text === "" ? `No messages in entries ${from}–${through}.` : text };
      }),
  });
