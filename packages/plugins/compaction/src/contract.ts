/**
 * Compaction's entry kinds and settings: the checkpoint that folds the model's view, the handoff
 * the model wrote with it, and the notes and memories written in the background.
 */

import { Effect, Schema } from "effect";

import { defineEntry, ModelRef, Seq } from "@liminal/sdk";

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
  user: "debug",
});

/** The tool the model calls to write a checkpoint. */
export const checkpointTool = "checkpoint";
