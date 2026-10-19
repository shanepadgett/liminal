/**
 * Compaction's entry kinds and settings: the checkpoint that folds the model's view, the handoff
 * the model wrote with it, and the notes and memories written in the background.
 */

import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { defineEntry, ModelRef, Seq, SessionId } from "@liminal/sdk";

/** The `compaction` section of `settings.json`. */
export const CompactionSettings = Schema.Struct({
  /** The most tokens a request may hold before the model must write a checkpoint. */
  budget: Schema.Int.pipe(Schema.withDecodingDefaultKey(Effect.succeed(200_000))),
});

export type CompactionSettings = typeof CompactionSettings.Type;

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
});

export type CheckpointData = typeof CheckpointData.Type;

export const CheckpointEntry = defineEntry({
  kind: "compaction/checkpoint",
  data: CheckpointData,
  model: false,
  user: "shown",
});

/** What the model wrote for itself at its checkpoint. */
export const HandoffEntry = defineEntry({
  kind: "compaction/handoff",
  data: Schema.Struct({ handoff: Schema.String }),
  model: false,
  user: "debug",
});

export const NoteLayer = Schema.Literals(["short-term", "long-term"]);

export type NoteLayer = typeof NoteLayer.Type;

/** A note or memory was written: its range and size only; the text stays in `memories.db`. */
export const NoteEntry = defineEntry({
  kind: "compaction/note",
  data: Schema.Struct({ layer: NoteLayer, from: Seq, through: Seq, tokens: Schema.Int }),
  model: false,
  user: "shown",
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

/** How full a session's context is, for the sidebar's Compaction section. */
export const CompactionStatus = Schema.Struct({
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

export type CompactionStatus = typeof CompactionStatus.Type;

/** Compaction's commands for frontends. */
export class CompactionRpcs extends RpcGroup.make(
  /** The session's status once it has a turn, then again after each change to its log. */
  Rpc.make("compaction/status", {
    payload: { session: SessionId },
    success: CompactionStatus,
    stream: true,
  }),
) {}
