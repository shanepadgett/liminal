/**
 * The tools the model can call, and how a call runs: checks that allow, deny or ask, then wrappers
 * around the tool's own run. No step changes a call's params.
 */

import { Context, Data, type Effect, type Option, type Schema } from "effect";

import {
  KeyedRegistry,
  Pipeline,
  Registry,
  type SessionId,
  type Tool,
  type ToolOutput,
} from "@liminal/sdk";

/** The tools by name, newest build first; a tool plugin registers its tools in its server's scope. */
export class Tools extends KeyedRegistry.Service<Tools, Tool>()("liminal/tools/Tools") {}

/** One call the model asked for, with its params unchecked. */
export interface ToolCall {
  readonly sessionId: SessionId;
  readonly callId: string;
  readonly name: string;
  readonly params: Schema.Json;
}

/** A check's answer for one call. */
export type ToolDecision = Data.TaggedEnum<{
  Allow: {};
  /** Final: no later check can turn it back to allow. */
  Deny: { readonly reason: string };
  /** The newest registered `Approvers` entry decides. */
  Ask: { readonly reason: string };
}>;

export const ToolDecision = Data.taggedEnum<ToolDecision>();

/** The user's answer to an `Ask`. */
export type ApprovalAnswer = Data.TaggedEnum<{ Allow: {}; Deny: { readonly reason: string } }>;

export const ApprovalAnswer = Data.taggedEnum<ApprovalAnswer>();

/** Runs before a call; permission rules read the tool's hints. */
export type ToolCheck = (call: ToolCall, tool: Tool) => Effect.Effect<ToolDecision>;

/**
 * The checks, run in order: the first deny is final; otherwise any ask goes to `Approvers`;
 * otherwise the call runs.
 */
export class ToolChecks extends Registry.Service<ToolChecks, ToolCheck>()(
  "liminal/tools/ToolChecks",
) {}

/** How a call ended; `failed` covers wrong params, an unknown tool and a crash. */
export type ToolOutcome =
  | { readonly status: "done"; readonly output: ToolOutput }
  | {
      readonly status: "failed" | "denied";
      readonly message: string;
      readonly details?: Schema.Json | undefined;
    };

/** What a wrapper sees of an allowed call. */
export interface AllowedCall {
  readonly call: ToolCall;
  readonly tool: Tool;
}

/** Middleware around an allowed call's run, such as moving large output to a file. */
export class ToolWrappers extends Registry.Service<
  ToolWrappers,
  Pipeline.Middleware<AllowedCall, ToolOutcome, never>
>()("liminal/tools/ToolWrappers") {}

/** Answers a call a check marked `Ask`; `reason` joins every check's reason. */
export type Approver = (call: ToolCall, reason: string) => Effect.Effect<ApprovalAnswer>;

/**
 * Who answers asks; the newest registration answers, such as the approval plugin's. With none, an
 * ask is denied.
 */
export class Approvers extends Registry.Service<Approvers, Approver>()("liminal/tools/Approvers") {}

export class ToolPipeline extends Context.Service<
  ToolPipeline,
  {
    /** Runs one call; `tool` is the step's tool by the call's name, if any. */
    readonly run: (call: ToolCall, tool: Option.Option<Tool>) => Effect.Effect<ToolOutcome>;
  }
>()("liminal/tools/ToolPipeline") {}
