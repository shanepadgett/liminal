/**
 * The `checkpoint` tool the model calls to fold its view, and the check that denies every other
 * tool once the context is full.
 */

import { Array as Arr, Effect, Option, Schema } from "effect";

import type { WorkspaceFiles } from "@liminal/files/contract";
import {
  defineTool,
  type Entry,
  type EntryDraft,
  Seq,
  type SessionId,
  ToolFailed,
} from "@liminal/sdk";
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
  LineRange,
  ModelTrigger,
  RestoredEntry,
  type Trigger,
} from "../contract.ts";
import { replyAround, turnStartsOf } from "./history.ts";
import { type MeasureDeps, measure } from "./measure.ts";
import { rememberedFiles, restore, RESTORE_SHARE, type Wanted } from "./restore.ts";
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
  readonly files: WorkspaceFiles["Service"];
}

/** What the model saved with its checkpoint. */
export interface ModelParts {
  readonly handoff: string;
  readonly name: Option.Option<string>;
  /** The files it asked for, most important first; none means the memories' choice. */
  readonly files: Option.Option<ReadonlyArray<Wanted>>;
}

const restoredSummary = (files: number, leftOut: number) =>
  leftOut === 0 ? `Files: ${files} read` : `Files: ${files} read, ${leftOut} left out`;

/** One checkpoint to save. */
export interface CheckpointRequest {
  readonly trigger: Trigger;
  /** The session's budget; restored files take a share of it. */
  readonly budget: number;
  /** What the model saved with it; none for an automatic checkpoint. */
  readonly parts: Option.Option<ModelParts>;
}

/**
 * Saves a checkpoint over what the memories cover now, with the files read back within a share of
 * the budget and, from the model, its handoff and session name, in one batch.
 */
export const saveCheckpoint = Effect.fn("memory.saveCheckpoint")(function* (
  deps: CheckpointDeps,
  session: SessionId,
  { trigger, budget, parts }: CheckpointRequest,
) {
  const stored: Stored = {
    notes: yield* deps.memories.notes(session),
    memories: yield* deps.memories.memories(session),
  };

  const used = covered(stored);

  const wanted = Option.getOrElse(
    Option.flatMap(parts, (each) => each.files),
    () => rememberedFiles(stored, used),
  );

  const restored = yield* restore(deps.files, wanted, Math.floor(budget * RESTORE_SHARE));
  const isRestoring = restored.files.length > 0 || restored.leftOut.length > 0;

  const drafts: readonly [EntryDraft, ...Array<EntryDraft>] = [
    {
      entry: CheckpointEntry,
      data: { trigger, ...used, restored: restored.files.length },
      text: "Checkpoint",
    },
    ...Option.match(parts, {
      onNone: () => [],
      onSome: ({ handoff, name }) => [
        { entry: HandoffEntry, data: { handoff }, text: handoff },
        ...Option.match(name, {
          onNone: () => [],
          onSome: (each) => [
            { entry: NamedEntry, data: { name: each }, text: `Session named: ${each}` },
          ],
        }),
      ],
    }),
    ...(isRestoring
      ? [
          {
            entry: RestoredEntry,
            data: restored,
            text: restoredSummary(restored.files.length, restored.leftOut.length),
          },
        ]
      : []),
  ];

  return yield* deps.log.append(session, drafts);
});

const Params = Schema.Struct({
  handoff: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(24_000)).annotate({
    description:
      "What you need to continue: the user's request and limits, unfinished work, blockers, unanswered questions and the exact next action last; 500 to 1,500 characters",
  }),
  files: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        path: Schema.String.annotate({ description: "Relative to the workspace" }),
        ranges: Schema.optionalKey(
          Schema.Array(LineRange).annotate({
            description: "Lines you need; leave out for the whole file",
          }),
        ),
      }),
    ).annotate({
      description:
        "Files you need open after the checkpoint, most important first. Leave out to restore the relevant files your memory lists",
    }),
  ),
  name: Schema.optionalKey(
    SessionName.annotate({
      description:
        "A new name for the session, one plain sentence of about 10 words. Fill it only when the current session name no longer describes the work; leave it out otherwise",
    }),
  ),
});

const alone = "Call checkpoint alone, without other tool calls.";

/** The model's `checkpoint` tool. */
export const checkpointToolOf = (deps: CheckpointDeps & MeasureDeps) =>
  defineTool({
    name: checkpointTool,
    description: [
      "Folds your context: from your next model call you see your short-term memory, the files it reads back, the recent entries and this handoff instead of the full history.",
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
    run: ({ handoff, name, files }, { sessionId, callId }) =>
      Effect.gen(function* () {
        const entries = yield* deps.log.read(sessionId, {});

        const calls = replyAround(entries, callId).filter(
          (entry: Entry) => entry.kind === ToolCallEntry.kind,
        );

        if (calls.length > 1) return yield* new ToolFailed({ message: alone });

        const start = Arr.last(turnStartsOf(entries));

        const budget = Option.isNone(start)
          ? 0
          : yield* measure(deps, sessionId, entries, start.value.model).pipe(
              Effect.map((measured) => measured.budget),
              Effect.catch((error) =>
                Effect.as(Effect.logWarning("memory budget unknown; no files read back", error), 0),
              ),
            );

        yield* saveCheckpoint(deps, sessionId, {
          trigger: ModelTrigger.make({ callId }),
          budget,
          parts: Option.some({
            handoff,
            name: Option.fromUndefinedOr(name),
            files: Option.map(Option.fromUndefinedOr(files), (each) =>
              each.map((file) => ({ path: file.path, ranges: file.ranges ?? [] })),
            ),
          }),
        });

        return {
          result:
            "Checkpoint saved. Your next model call starts from your long-term and short-term memory, the files read back, recent entries and this handoff.",
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
