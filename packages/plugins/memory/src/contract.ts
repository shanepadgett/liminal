/**
 * Memory's entry kinds and settings: the checkpoint that folds the model's view, the handoff the
 * model wrote with it, and the notes and memories written in the background.
 */

import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { defineEntry, ModelRef, Seq, SessionId } from "@liminal/sdk";

/** The `memory` section of `settings.json`. */
export const MemorySettings = Schema.Struct({
  /** The most tokens a request may hold before the model must write a checkpoint. */
  budget: Schema.Int.pipe(Schema.withDecodingDefaultKey(Effect.succeed(200_000))),
});

export type MemorySettings = typeof MemorySettings.Type;

/** The model called `checkpoint`. */
export const ModelTrigger = Schema.TaggedStruct("Model", { callId: Schema.String });

/** The provider's cache lifetime passed since the last reply. */
export const IdleTrigger = Schema.TaggedStruct("Idle", { idleSeconds: Schema.Int });

/** The turn's model differs from the previous turn's. */
export const SwitchTrigger = Schema.TaggedStruct("Switch", { from: ModelRef });

/** Who wrote a checkpoint: the model through its tool, or Liminal once the cache was lost. */
export const Trigger = Schema.Union([ModelTrigger, IdleTrigger, SwitchTrigger]);

export type Trigger = typeof Trigger.Type;

/** Where the model's view starts over, and the notes and memory that stand in for what came before. */
export const CheckpointData = Schema.Struct({
  trigger: Trigger,
  /** The number of the long-term memory used. */
  longTerm: Schema.optionalKey(Schema.Int),
  /** The numbers of the short-term notes used, oldest first. */
  shortTerm: Schema.Array(Schema.Int),
  /** The first entry no note or memory covers. */
  tailFrom: Seq,
  /** The files read back with it; checkpoints saved before restoring files read none. */
  restored: Schema.Int.pipe(Schema.withDecodingDefaultKey(Effect.succeed(0))),
});

export type CheckpointData = typeof CheckpointData.Type;

export const CheckpointEntry = defineEntry({
  kind: "memory/checkpoint",
  data: CheckpointData,
  model: false,
  user: "shown",
});

/** What the model wrote for itself at its checkpoint. */
export const HandoffEntry = defineEntry({
  kind: "memory/handoff",
  data: Schema.Struct({ handoff: Schema.String }),
  model: false,
  user: "debug",
});

export const NoteLayer = Schema.Literals(["short-term", "long-term"]);

export type NoteLayer = typeof NoteLayer.Type;

/** A note or memory was written: its range and size only; the text stays in `memories.db`. */
export const NoteEntry = defineEntry({
  kind: "memory/memory-written",
  data: Schema.Struct({ layer: NoteLayer, from: Seq, through: Seq, tokens: Schema.Int }),
  model: false,
  user: "shown",
});

/** Lines `from` through `through` of a file, counted from 1. */
export const LineRange = Schema.Struct({ from: Schema.Int, through: Schema.Int });

export type LineRange = typeof LineRange.Type;

/** A file one call read or changed; no ranges means the whole file. */
export const TouchedFile = Schema.Struct({
  /** Relative to the workspace. */
  path: Schema.String,
  ranges: Schema.Array(LineRange),
  edited: Schema.Boolean,
});

export type TouchedFile = typeof TouchedFile.Type;

/** What one call, the model's own or one inside `run`, read or changed. */
export const TouchedEntry = defineEntry({
  kind: "memory/touched",
  data: Schema.Struct({ callId: Schema.String, files: Schema.Array(TouchedFile) }),
  model: false,
  user: "hidden",
});

/** A file a memory knows about, labeled by whether the work still needs it. */
export const MemoryFile = Schema.Struct({
  ...TouchedFile.fields,
  relevant: Schema.Boolean,
  /** Why it matters, or why it does not. */
  reason: Schema.String,
  /** The last entry that touched it, so newer files sort first. */
  seq: Seq,
});

export type MemoryFile = typeof MemoryFile.Type;

/** A file a checkpoint read back, in `read`'s format; no ranges means the whole file. */
export const RestoredFile = Schema.Struct({
  path: Schema.String,
  ranges: Schema.Array(LineRange),
  text: Schema.String,
});

export type RestoredFile = typeof RestoredFile.Type;

/** The files a checkpoint read back, and those the budget left out; the view step shows them. */
export const RestoredEntry = defineEntry({
  kind: "memory/restored",
  data: Schema.Struct({ files: Schema.Array(RestoredFile), leftOut: Schema.Array(Schema.String) }),
  model: false,
  user: "debug",
});

/** The tool the model calls to write a checkpoint. */
export const checkpointTool = "checkpoint";

const EntryNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/** The tool the model calls to read entries a checkpoint folded away. */
export const historyTool = "history";

/** The params of `history`: entries `from` through `through`, inclusive. */
export const HistoryParams = Schema.Struct({
  from: EntryNumber.annotate({ description: "First entry to read" }),
  through: EntryNumber.annotate({ description: "Last entry to read" }),
});

/** How full the context is, in order: none, then a nudge at half, three quarters, then forced. */
export const Stage = Schema.Literals(["none", "notice", "warning", "forced"]);

export type Stage = typeof Stage.Type;

/** How full a session's context is, for the sidebar's Memory section. */
export const MemoryStatus = Schema.Struct({
  /** The view's tokens: the last reply's, plus estimates for the entries after it. */
  size: Schema.Int,
  /** The most tokens a request may hold before the model must write a checkpoint. */
  budget: Schema.Int,
  stage: Stage,
  /** The last entry the background notes cover; absent before the first note. */
  notesThrough: Schema.optionalKey(Seq),
  /** The checkpoints written so far. */
  checkpoints: Schema.Int,
});

export type MemoryStatus = typeof MemoryStatus.Type;

/** Memory's commands for frontends. */
export class MemoryRpcs extends RpcGroup.make(
  /** The session's status once it has a turn, then again after each change to its log. */
  Rpc.make("memory/status", {
    payload: { session: SessionId },
    success: MemoryStatus,
    stream: true,
  }),
) {}
