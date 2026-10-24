/** The `checkpoint` tool: the model starts its context over, with a note and files read back. */
import { Effect, Option, Schema } from "effect";

import {
  MessageEvent,
  type SessionId,
  type SessionLog,
  SessionNamed,
} from "@shanepadgett/liminal-session/contract";
import { defineTool, ToolFailed, type ToolOutput } from "@shanepadgett/liminal-tools/contract";

import type { Checkpoint } from "./checkpoint.ts";
import { checkpointName } from "./contract.ts";
import { FileRange, type ReadBacks } from "./files.ts";

const DESCRIPTION = `Starts your context over from your memories. As you work, earlier stretches are kept as memories; after a checkpoint you see those memories, the most recent work, your note and the files you list, read back in.

Call it when reminders say the context is large, at a natural break: after finishing a piece of work, before starting the next. Call it alone, with no other tool calls in the same reply.

\`note\` is for you after the checkpoint: the goal, what is done, what comes next, the decisions and preferences the user stated, and anything your memories may lack. \`files\` are the files you will need next, with line ranges for large ones. \`name\` renames the session when what it is about has changed.`;

const Input = Schema.Struct({
  note: Schema.String.annotate({ description: "What you need to carry on after the checkpoint." }),
  files: Schema.optionalKey(
    Schema.Array(FileRange).annotate({ description: "Files to read back in; at most 30K tokens." }),
  ),
  name: Schema.optionalKey(
    Schema.String.annotate({ description: "A new session name, 3 to 8 words in sentence case." }),
  ),
});

/** How many tool calls the reply holding call `callId` asks for. */
const callsBeside = (log: SessionLog["Service"], session: SessionId, callId: string) =>
  Effect.map(log.read(session), (events) => {
    const message = events.findLast((event) =>
      Option.exists(MessageEvent.decodeOption(event), ({ parts }) =>
        parts.some((part) => part.type === "tool-call" && part.id === callId),
      ),
    );

    const parts = Option.match(
      Option.flatMap(Option.fromNullishOr(message), (event) => MessageEvent.decodeOption(event)),
      { onNone: () => [], onSome: (found) => found.parts },
    );

    return parts.filter((part) => part.type === "tool-call").length;
  });

const resultOf = ({ read, skipped }: ReadBacks): ToolOutput => {
  const files = read.map(({ path, text }) => `<file path="${path}">\n${text}\n</file>`);
  const left = skipped.length === 0 ? [] : [`Not read back: ${skipped.join(", ")}.`];

  const already =
    read.length === 0 ? [] : ["These files are read; read them again only if they change."];

  const text = ["Checkpoint made. Carry on from your note.", ...files, ...already, ...left];

  return { content: [{ type: "text", text: text.join("\n\n") }] };
};

const failed = (error: { readonly message: string }) => new ToolFailed({ message: error.message });

export const makeCheckpointTool = (
  log: SessionLog["Service"],
  checkpoint: Checkpoint,
  readBack: (files: ReadonlyArray<FileRange>) => Effect.Effect<ReadBacks>,
) =>
  defineTool({
    name: checkpointName,
    description: DESCRIPTION,
    input: Input,
    access: ({ files = [] }) => ({ kind: "read", paths: files.map(({ path }) => path) }),
    run: Effect.fn("checkpoint")(function* ({ files = [], name }, { session, callId }) {
      if ((yield* Effect.mapError(callsBeside(log, session, callId), failed)) > 1)
        return yield* new ToolFailed({
          message: "Call checkpoint alone, with no other tool calls in the same reply.",
        });

      const backs = yield* readBack(files);
      const paths = backs.read.map(({ path }) => path);
      yield* Effect.mapError(checkpoint(session, "model", paths), failed);

      const trimmed = name?.trim() ?? "";

      if (trimmed !== "")
        yield* Effect.mapError(
          Effect.flatMap(SessionNamed.make({ name: trimmed }), (event) =>
            log.append(session, [event]),
          ),
          failed,
        );

      return resultOf(backs);
    }),
  });
