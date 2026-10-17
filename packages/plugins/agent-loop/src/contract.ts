/**
 * A turn: steps of one model call and the tool calls it asked for, and the three checkpoints where
 * plugins join it.
 */

import { Context, Data, type Duration, type Effect } from "effect";

import {
  type EntryDraft,
  type InvalidEntry,
  type ModelError,
  type ModelRef,
  type ProviderNotFound,
  Registry,
  type SessionId,
  type SessionNotFound,
  type StoreError,
  type ThinkingLevel,
} from "@liminal/sdk";

/** What a turn's caller chooses for its model calls. */
export interface TurnSettings {
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly maxOutputTokens?: number;
}

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
export type TurnError = ModelError | ProviderNotFound | SessionNotFound | InvalidEntry | StoreError;

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
  }
>()("liminal/agent-loop/AgentLoop") {}
