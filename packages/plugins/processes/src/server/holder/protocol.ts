/**
 * How the server part talks to the holder program: Effect RPC on a Unix socket whose name carries
 * the protocol's version, so a holder of another version is never reached.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  BadPattern,
  ProcessError,
  ProcessExit,
  ProcessNotRunning,
  ProcessSummary,
  UnknownProcess,
  WaitResult,
} from "../../contract.ts";

/** Changed whenever the commands below change shape. */
const PROTOCOL_VERSION = 1;

/** The socket's file name in the temp folder. */
export const socketName = `processes-${PROTOCOL_VERSION}.sock`;

const Command = { session: Schema.String, id: Schema.String };

export const ReadResult = Schema.Struct({ process: ProcessSummary, output: Schema.String });

export class HolderRpcs extends RpcGroup.make(
  /** Answers once the holder serves. */
  Rpc.make("holder/hello"),
  Rpc.make("holder/start", {
    payload: {
      session: Schema.String,
      command: Schema.String,
      cwd: Schema.String,
      pty: Schema.Boolean,
      waitSeconds: Schema.Finite,
    },
    success: WaitResult,
    error: ProcessError,
  }),
  Rpc.make("holder/list", {
    payload: { session: Schema.String },
    success: Schema.Array(ProcessSummary),
  }),
  /** The session's commands now, then after each start or change of state. */
  Rpc.make("holder/watch", {
    payload: { session: Schema.String },
    success: Schema.Array(ProcessSummary),
    stream: true,
  }),
  Rpc.make("holder/read", { payload: Command, success: ReadResult, error: UnknownProcess }),
  Rpc.make("holder/write", {
    payload: { ...Command, text: Schema.String },
    error: Schema.Union([UnknownProcess, ProcessNotRunning]),
  }),
  Rpc.make("holder/wait", {
    payload: {
      ...Command,
      pattern: Schema.optionalKey(Schema.String),
      quietSeconds: Schema.Finite,
      deadlineSeconds: Schema.Finite,
    },
    success: WaitResult,
    error: Schema.Union([UnknownProcess, BadPattern]),
  }),
  Rpc.make("holder/stop", { payload: Command, success: ProcessSummary, error: UnknownProcess }),
  /** The session's commands that exited by themselves since the last ask; each comes once. */
  Rpc.make("holder/exits", {
    payload: { session: Schema.String },
    success: Schema.Array(ProcessExit),
  }),
  /** The command's last lines now, then after each change, until it ends. */
  Rpc.make("holder/output", {
    payload: Command,
    success: Schema.String,
    error: UnknownProcess,
    stream: true,
  }),
) {}
