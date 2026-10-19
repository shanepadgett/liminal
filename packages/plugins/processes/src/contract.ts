/**
 * Processes: commands the agent starts and leaves running across turns and restarts, as their
 * summaries, what a wait saw, and the commands frontends call.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { defineEntry, SessionId } from "@liminal/sdk";

export const Running = Schema.TaggedStruct("Running", {});
export const Exited = Schema.TaggedStruct("Exited", { code: Schema.Int });
/** Stopped by the agent or the user, with everything it started. */
export const Stopped = Schema.TaggedStruct("Stopped", {});

export const ProcessState = Schema.Union([Running, Exited, Stopped]);

export type ProcessState = typeof ProcessState.Type;

/** One command of a session. */
export const ProcessSummary = Schema.Struct({
  /** `p1`, `p2` and so on, in the order the session started them. */
  id: Schema.String,
  command: Schema.String,
  /** It runs on a pseudo-terminal. */
  pty: Schema.Boolean,
  state: ProcessState,
});

export type ProcessSummary = typeof ProcessSummary.Type;

/** Why a wait returned. */
export const WaitReason = Schema.Literals(["exited", "stopped", "matched", "quiet", "deadline"]);

export type WaitReason = typeof WaitReason.Type;

/** What a wait saw: the output since the last read, and the last lines when none came. */
export const WaitResult = Schema.Struct({
  reason: WaitReason,
  process: ProcessSummary,
  output: Schema.String,
  /** The last lines of all output, set only when no new output arrived. */
  tail: Schema.optionalKey(Schema.String),
});

export type WaitResult = typeof WaitResult.Type;

/** A command that exited by itself and was not reported yet, with its last lines. */
export const ProcessExit = Schema.Struct({ process: ProcessSummary, tail: Schema.String });

export type ProcessExit = typeof ProcessExit.Type;

export class UnknownProcess extends Schema.TaggedError<
  UnknownProcess,
  { readonly brand: unique symbol }
>()("UnknownProcess", { id: Schema.String }) {
  override get message() {
    return `There is no command ${this.id}; process_list shows the ids.`;
  }
}

export class ProcessNotRunning extends Schema.TaggedError<
  ProcessNotRunning,
  { readonly brand: unique symbol }
>()("ProcessNotRunning", { id: Schema.String }) {
  override get message() {
    return `Command ${this.id} is not running, so it takes no input.`;
  }
}

export class ProcessStartFailed extends Schema.TaggedError<
  ProcessStartFailed,
  { readonly brand: unique symbol }
>()("ProcessStartFailed", { command: Schema.String, reason: Schema.String }) {
  override get message() {
    return `The command could not start: ${this.reason}`;
  }
}

export class BadPattern extends Schema.TaggedError<BadPattern, { readonly brand: unique symbol }>()(
  "BadPattern",
  { pattern: Schema.String },
) {
  override get message() {
    return `${this.pattern} is not a valid regular expression.`;
  }
}

/** The holder program could not be reached or started. */
export class HolderUnavailable extends Schema.TaggedError<
  HolderUnavailable,
  { readonly brand: unique symbol }
>()("HolderUnavailable", { reason: Schema.String }) {
  override get message() {
    return `The processes holder is not available: ${this.reason}`;
  }
}

export const ProcessError = Schema.Union([
  UnknownProcess,
  ProcessNotRunning,
  ProcessStartFailed,
  BadPattern,
]);

export type ProcessError = typeof ProcessError.Type;

/** A command exited, or commands still run after a restart; the model reads it as a message. */
export const NoticeEntry = defineEntry({
  kind: "processes/notice",
  data: Schema.Struct({ text: Schema.String }),
  model: true,
  user: "shown",
});

/** The tools' names, which the TUI words its rows by. */
export const processTools = {
  start: "process_start",
  wait: "process_wait",
  read: "process_read",
  write: "process_write",
  stop: "process_stop",
  list: "process_list",
} as const;

export const StartParams = Schema.Struct({
  command: Schema.String.annotate({ description: "Command line run by /bin/sh in the workspace" }),
  pty: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Run on a terminal, for a program that needs one such as a REPL or a prompt",
    }),
  ),
  waitSeconds: Schema.optionalKey(
    Schema.Finite.check(Schema.isBetween({ minimum: 0.25, maximum: 30 })).annotate({
      description: "Seconds to wait for it to exit before leaving it running; 1 when left out",
    }),
  ),
});

export const IdParams = Schema.Struct({
  id: Schema.String.annotate({ description: "The command's id, such as p1" }),
});

export const WaitParams = Schema.Struct({
  ...IdParams.fields,
  pattern: Schema.optionalKey(
    Schema.String.annotate({ description: "A regular expression; a matching line ends the wait" }),
  ),
  quietSeconds: Schema.optionalKey(
    Schema.Finite.check(Schema.isGreaterThan(0)).annotate({
      description: "Seconds without new output that end the wait; 30 when left out",
    }),
  ),
  deadlineSeconds: Schema.optionalKey(
    Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 3600 })).annotate({
      description: "Seconds after which the wait ends anyway; 300 when left out",
    }),
  ),
});

export type WaitParams = typeof WaitParams.Type;

export const WriteParams = Schema.Struct({
  ...IdParams.fields,
  text: Schema.String.annotate({ description: "Text to type; end a line with \\n to send it" }),
});

/** Processes' commands for frontends. */
export class ProcessesRpcs extends RpcGroup.make(
  /** The session's commands now, then after each change; empty while no holder runs. */
  Rpc.make("processes/list", {
    payload: { session: SessionId },
    success: Schema.Array(ProcessSummary),
    stream: true,
  }),
  /** The command's last output lines now, then after each change, until it ends. */
  Rpc.make("processes/output", {
    payload: { session: SessionId, id: Schema.String },
    success: Schema.String,
    stream: true,
  }),
) {}
