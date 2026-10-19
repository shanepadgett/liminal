/**
 * The `checkpoint` tool the model calls to fold its view, and the check that denies every other
 * tool once the context is full.
 */

import { Array as Arr, Effect, Option, Schema } from "effect";

import { defineTool, type Entry, Seq, type SessionId, ToolFailed } from "@liminal/sdk";
import {
  NamedEntry,
  SessionName,
  type SessionLog,
  ToolCallEntry,
} from "@liminal/session-log/contract";
import { type ToolCheck, ToolDecision } from "@liminal/tools/contract";

import {
  CheckpointEntry,
  checkpointTool,
  HandoffEntry,
  ModelTrigger,
  type Trigger,
} from "../contract.ts";
import { replyAround, turnStartsOf } from "./history.ts";
import { type MeasureDeps, measure } from "./measure.ts";
import { type Memories, unfoldedNotes } from "./store.ts";
import type { Stored } from "./view.ts";

/** The checkpoint's view of what notes and memory cover. */
export interface Covered {
  readonly longTerm?: number;
  readonly shortTerm: ReadonlyArray<number>;
  readonly tailFrom: Seq;
}

/** The newest memory, the notes after it and the first entry neither covers. */
export const covered = (stored: Stored): Covered => {
  const memory = Arr.last(stored.memories);
  const notes = unfoldedNotes(stored.notes, memory);

  const through = Option.match(Arr.last(notes), {
    onNone: () => Option.match(memory, { onNone: () => 0, onSome: (each) => each.throughSeq }),
    onSome: (note) => note.through,
  });

  const shortTerm = notes.map((note) => note.number);
  const tailFrom = Seq.make(through + 1);

  return Option.match(memory, {
    onNone: () => ({ shortTerm, tailFrom }),
    onSome: (each) => ({ longTerm: each.number, shortTerm, tailFrom }),
  });
};

/** What the tool reads and writes with. */
export interface CheckpointDeps {
  readonly log: SessionLog["Service"];
  readonly memories: Memories["Service"];
}

/** Saves a checkpoint of `trigger` over what the notes cover now. */
export const saveCheckpoint = Effect.fn("memory.saveCheckpoint")(function* (
  deps: CheckpointDeps,
  session: SessionId,
  trigger: Trigger,
) {
  const stored: Stored = {
    notes: yield* deps.memories.notes(session),
    memories: yield* deps.memories.memories(session),
  };

  return yield* deps.log.append(session, [
    { entry: CheckpointEntry, data: { trigger, ...covered(stored) }, text: "Checkpoint" },
  ]);
});

const Params = Schema.Struct({
  handoff: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(24_000)).annotate({
    description:
      "What you need to continue: the user's request and limits, unfinished work, blockers, unanswered questions and the exact next action last; 500 to 1,500 characters",
  }),
  name: Schema.optionalKey(
    SessionName.annotate({
      description:
        "A new name for the session, one plain sentence of about 10 words. Fill it only when the current session name no longer describes the work; leave it out otherwise",
    }),
  ),
});

const alone = "Call checkpoint alone, without other tool calls.";

/** The model's `checkpoint` tool. */
export const checkpointToolOf = (deps: CheckpointDeps) =>
  defineTool({
    name: checkpointTool,
    description: [
      "Folds your context: from your next model call you see your short-term memory, the recent entries and this handoff instead of the full history.",
      "Call it on its own, when a nudge asks and a bounded unit of work is done, never only to send a final answer.",
    ].join(" "),
    parameters: Params,
    hints: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    runAlongside: false,
    safeToRerun: false,
    run: ({ handoff, name }, { sessionId, callId }) =>
      Effect.gen(function* () {
        const entries = yield* deps.log.read(sessionId, {});

        const calls = replyAround(entries, callId).filter(
          (entry: Entry) => entry.kind === ToolCallEntry.kind,
        );

        if (calls.length > 1) return yield* new ToolFailed({ message: alone });

        yield* saveCheckpoint(deps, sessionId, ModelTrigger.make({ callId }));

        yield* deps.log.append(sessionId, [
          { entry: HandoffEntry, data: { handoff }, text: handoff },
          ...(name === undefined
            ? []
            : [{ entry: NamedEntry, data: { name }, text: `Session named: ${name}` }]),
        ]);

        return {
          result:
            "Checkpoint saved. Your next model call starts from your long-term and short-term memory, recent entries and this handoff.",
        };
      }).pipe(
        Effect.catchTags({
          MemoriesError: (error) => Effect.fail(new ToolFailed({ message: error.message })),
          StoreError: (error) => Effect.fail(new ToolFailed({ message: error.message })),
          SessionNotFound: () => Effect.fail(new ToolFailed({ message: "session not found" })),
          InvalidEntry: (error) => Effect.fail(new ToolFailed({ message: error.message })),
        }),
      ),
  });

const full = "Context is full. Call checkpoint first.";

/** At the forced stage, denies every tool but `checkpoint`. */
export const forcedCheck =
  (deps: CheckpointDeps & MeasureDeps): ToolCheck =>
  (call, tool) => {
    if (tool.spec.name === checkpointTool) return Effect.succeed(ToolDecision.Allow());

    return Effect.gen(function* () {
      const entries = yield* deps.log.read(call.sessionId, {});
      const start = Arr.last(turnStartsOf(entries));
      if (Option.isNone(start)) return ToolDecision.Allow();

      const { stage } = yield* measure(deps, call.sessionId, entries, start.value.model);

      return stage === "forced" ? ToolDecision.Deny({ reason: full }) : ToolDecision.Allow();
    }).pipe(
      Effect.catch((error) =>
        Effect.as(Effect.logWarning("memory check failed", error), ToolDecision.Allow()),
      ),
    );
  };
