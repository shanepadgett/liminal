/** Memory's events, the name of its tool, and the RPC that follows a session's memory. */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  defineEvent,
  EventInvalid,
  Seq,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

/** The name of the tool the model checkpoints with. */
export const checkpointName = "checkpoint";

/** What a memory sums up: a stretch of entries, or older memories it compacts. */
export const Covers = Schema.TaggedUnion({
  Entries: { from: Seq, to: Seq },
  Memories: { seqs: Schema.Array(Seq) },
});

export type Covers = typeof Covers.Type;

/**
 * A memory the small model wrote. It has no converter: the model sees memories only through a
 * checkpoint.
 */
export const MemoryWritten = defineEvent(
  "memory/memory",
  Schema.Struct({
    covers: Covers,
    /** A few words in the model's voice, for the transcript. */
    line: Schema.String,
    text: Schema.String,
  }),
);

export type MemoryWritten = typeof MemoryWritten.schema.Type;

/** What made a checkpoint: the model's tool call, a lost cache, a new model, or a full window. */
export const Trigger = Schema.Literals(["model", "idle", "model-switch", "overflow"]);
export type Trigger = typeof Trigger.Type;

/** Where the model's context starts over: its memories, then the entries from `from` on. */
export const CheckpointMade = defineEvent(
  "memory/checkpoint",
  Schema.Struct({
    trigger: Trigger,
    /** The memories no other memory covered, oldest first. */
    memories: Schema.Array(Seq),
    /** The first entry no memory covered. */
    from: Seq,
    /** The paths read back in; empty for every trigger but `model`. */
    files: Schema.Array(Schema.String),
  }),
);

export type CheckpointMade = typeof CheckpointMade.schema.Type;

/** How full the context is: worth a checkpoint, due for one soon, or too full for other tools. */
export const NudgeLevel = Schema.Literals(["consider", "soon", "full"]);
export type NudgeLevel = typeof NudgeLevel.Type;

/** A reminder to checkpoint, shown to the model and left out of the transcript. */
export const Nudge = defineEvent("memory/nudge", Schema.Struct({ level: NudgeLevel }));

/** A session's memory as the sidebar shows it. */
export const MemoryStatus = Schema.Struct({
  /** The memories the next checkpoint would carry. */
  memories: Schema.Int,
  checkpoints: Schema.Int,
  /** The small model is writing or compacting a memory. */
  writing: Schema.Boolean,
});

export type MemoryStatus = typeof MemoryStatus.Type;

export class MemoryRpc extends RpcGroup.make(
  /** The session's memory now, then after each change. */
  Rpc.make("memory/status", {
    payload: { session: SessionId },
    success: MemoryStatus,
    error: Schema.Union([SessionNotFound, SessionStoreFailed, EventInvalid]),
    stream: true,
  }),
) {}
