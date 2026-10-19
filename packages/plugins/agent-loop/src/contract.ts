/**
 * A turn: steps of one model call and the tool calls it asked for, and the three checkpoints where
 * plugins join it.
 */

import { Context, Data, type Duration, type Effect, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  type EntryDraft,
  type InvalidEntry,
  type ModelError,
  ModelRef,
  type ProviderNotFound,
  Registry,
  type SessionId,
  type SessionNotFound,
  type StoreError,
  type CatalogUnavailable,
} from "@liminal/sdk";
import { TurnSettings } from "@liminal/session-log/contract";

/**
 * A thinking option's id; a model that does not offer it uses its default, and one with no options
 * thinks as it does by default.
 */
const ThinkingChoice = Schema.String;

/** The `agent-loop` settings section: what a new turn uses unless its caller chooses. */
export const AgentLoopSection = Schema.Struct({
  model: Schema.optionalKey(ModelRef),
  thinking: Schema.optionalKey(ThinkingChoice),
});

/** No `agent-loop.model` is set in any settings file. */
export class NoDefaultModel extends Schema.TaggedError<
  NoDefaultModel,
  { readonly brand: unique symbol }
>()("NoDefaultModel", {}) {
  override get message() {
    return "No model is set; set agent-loop.model in a settings file.";
  }
}

/** The `agent-loop` settings section does not decode. */
export class DefaultsInvalid extends Schema.TaggedError<
  DefaultsInvalid,
  { readonly brand: unique symbol }
>()("DefaultsInvalid", { message: Schema.String }) {}

/** Why a new turn's settings cannot be read. */
export const DefaultsError = Schema.Union([NoDefaultModel, DefaultsInvalid]);

export type DefaultsError = typeof DefaultsError.Type;

/** A new turn's settings, as frontends show them. */
export const DefaultsSet = Schema.TaggedStruct("DefaultsSet", {
  settings: TurnSettings,
  /** The label of the option a turn would use; absent when the model offers none or is not found. */
  thinkingLabel: Schema.optionalKey(Schema.String),
});

/** Why no new turn can start: no model is set, or the section does not decode. */
export const DefaultsMissing = Schema.TaggedStruct("DefaultsMissing", { message: Schema.String });

export const DefaultsView = Schema.Union([DefaultsSet, DefaultsMissing]);

export type DefaultsView = typeof DefaultsView.Type;

/** The global settings file could not take a new default. */
export class DefaultSetFailed extends Schema.TaggedError<
  DefaultSetFailed,
  { readonly brand: unique symbol }
>()("DefaultSetFailed", { message: Schema.String }) {}

/** The turn a hook is called for. */
export interface Turn {
  readonly sessionId: SessionId;
  readonly settings: TurnSettings;
}

/** A before-call hook's answer. */
export type BeforeCall = Data.TaggedEnum<{
  /** Saved, with every other hook's input, before the model call. */
  Proceed: { readonly input: ReadonlyArray<EntryDraft> };
  /** Ends the turn before the call; later hooks do not run. */
  EndTurn: { readonly reason: string };
  /**
   * Saves `input`, with earlier hooks' input, and ends the turn as answered, waiting on the user,
   * such as for a form of questions; no notice is saved and later hooks do not run.
   */
  Await: { readonly input: ReadonlyArray<EntryDraft> };
}>;

export const BeforeCall = Data.taggedEnum<BeforeCall>();

/** Runs before each model call, in order, such as adding steering input. */
export type BeforeCallHook = (turn: Turn) => Effect.Effect<BeforeCall>;

export class BeforeCallHooks extends Registry.Service<BeforeCallHooks, BeforeCallHook>()(
  "liminal/agent-loop/BeforeCallHooks",
) {}

/** An after-failure hook's answer. */
export type AfterFailure = Data.TaggedEnum<{
  /** Drops the failed attempt and calls again after `after`; the first retry wins. */
  Retry: { readonly after: Duration.Duration };
  GiveUp: {};
}>;

export const AfterFailure = Data.taggedEnum<AfterFailure>();

/** Runs after a failed model call, in order; `attempt` counts from 1. */
export type AfterFailureHook = (
  turn: Turn,
  error: ModelError | ProviderNotFound,
  attempt: number,
) => Effect.Effect<AfterFailure>;

export class AfterFailureHooks extends Registry.Service<AfterFailureHooks, AfterFailureHook>()(
  "liminal/agent-loop/AfterFailureHooks",
) {}

/** Runs when the turn would end, in order; any input saved continues the turn, such as a follow-up. */
export type TurnEndingHook = (turn: Turn) => Effect.Effect<ReadonlyArray<EntryDraft>>;

export class TurnEndingHooks extends Registry.Service<TurnEndingHooks, TurnEndingHook>()(
  "liminal/agent-loop/TurnEndingHooks",
) {}

/** How a step left the turn. */
export type StepOutcome = Data.TaggedEnum<{
  /** Run another step. */
  Continue: {};
  /** The model answered with no tool calls and no hook continued the turn. */
  Answered: {};
  /** A before-call hook ended the turn. */
  EndedByPlugin: { readonly reason: string };
}>;

export const StepOutcome = Data.taggedEnum<StepOutcome>();

/** A turn's end. */
export type TurnEnd = Exclude<StepOutcome, { readonly _tag: "Continue" }>;

/** Why a turn stopped on an error; nothing about the failure is saved. */
export type TurnError =
  | ModelError
  | ProviderNotFound
  | CatalogUnavailable
  | SessionNotFound
  | InvalidEntry
  | StoreError;

export class AgentLoop extends Context.Service<
  AgentLoop,
  {
    /**
     * Runs one step from the session log: answers tool calls left without results, then calls the
     * model and runs the tool calls it asks for. Interrupting it saves the output so far.
     */
    readonly step: (
      sessionId: SessionId,
      settings: TurnSettings,
    ) => Effect.Effect<StepOutcome, TurnError>;
    /** Runs steps until the turn ends. */
    readonly run: (
      sessionId: SessionId,
      settings: TurnSettings,
    ) => Effect.Effect<TurnEnd, TurnError>;
    /**
     * Saves TurnStartedEntry and runs the turn as kernel-held work, each step on the graph current
     * when it starts, until it saves TurnEndedEntry; a session's running turn is left alone.
     */
    readonly start: (
      sessionId: SessionId,
      settings: TurnSettings,
    ) => Effect.Effect<void, SessionNotFound | InvalidEntry | StoreError>;
    /** A new turn's settings, from the `agent-loop` settings section; read on each call. */
    readonly defaults: Effect.Effect<TurnSettings, DefaultsError>;
    /** The defaults now, then again after each `setDefault`. */
    readonly defaultsChanges: Stream.Stream<DefaultsView>;
    /** Sets the default model, and the thinking option when given, in the global settings file. */
    readonly setDefault: (
      model: ModelRef,
      thinking?: string,
    ) => Effect.Effect<void, DefaultSetFailed>;
    /** Interrupts the session's running turn and saves it as cancelled; no turn running is a no-op. */
    readonly cancel: (
      sessionId: SessionId,
    ) => Effect.Effect<void, SessionNotFound | InvalidEntry | StoreError>;
  }
>()("liminal/agent-loop/AgentLoop") {}

/**
 * One part of a streaming reply: its text so far, and `done` once it has finished streaming. A
 * finished text part keeps its text until the reply is saved.
 */
export const LivePart = Schema.Struct({
  type: Schema.Literals(["text", "reasoning", "tool-call"]),
  text: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  done: Schema.optionalKey(Schema.Boolean),
});

export type LivePart = typeof LivePart.Type;

/** The live state of a streaming reply, kind `agent-loop/reply`. */
export const LiveReply = {
  kind: "agent-loop/reply",
  data: Schema.Struct({ parts: Schema.Array(LivePart) }),
};

/** The live state while a failed model call waits to retry, kind `agent-loop/retry`. */
export const LiveRetry = {
  kind: "agent-loop/retry",
  data: Schema.Struct({ attempt: Schema.Int, message: Schema.String }),
};

/** Agent-loop's commands for frontends. */
export class AgentLoopRpcs extends RpcGroup.make(
  Rpc.make("agent-loop/defaults", { success: DefaultsView, stream: true }),
  Rpc.make("agent-loop/set-default", {
    payload: { model: ModelRef, thinking: Schema.optionalKey(ThinkingChoice) },
    error: DefaultSetFailed,
  }),
) {}
