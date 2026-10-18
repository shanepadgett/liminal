/**
 * Decisions: decision models, such as Jev and Luna Decisions, answer choice, score and yes or no
 * questions about a JSON state with probabilities. Provider plugins register the ones their login
 * serves; `Decisions` picks one and checks its answers.
 */

import { Context, Data, type Effect } from "effect";

import {
  type Answer,
  type DecisionFailed,
  type DecisionState,
  KeyedRegistry,
  type Question,
} from "@liminal/sdk";

/** The decision models Liminal knows: Jev is asked before Luna Decisions. */
export type DecisionFamily = "jev" | "luna";

/** Which family to ask: `auto` asks Jev first, then Luna Decisions. */
export type DecisionPreference = "auto" | DecisionFamily;

/** What a provider plugin registers. */
export interface DecisionModel {
  /** Provider and family, such as `openrouter/jev`. */
  readonly id: string;
  readonly family: DecisionFamily;
  /** Whether the provider has a usable login, such as an API key. */
  readonly available: Effect.Effect<boolean>;
  /** One call; answers are keyed by question id. */
  readonly classify: (
    state: DecisionState,
    questions: Readonly<Record<string, Question>>,
  ) => Effect.Effect<Readonly<Record<string, Answer>>, DecisionFailed>;
}

/** The registered decision models by id; provider plugins register in their server's scope. */
export class DecisionModels extends KeyedRegistry.Service<DecisionModels, DecisionModel>()(
  "liminal/decisions/DecisionModels",
) {}

/** Why no answers came back. */
export type SkipReason = "unavailable" | "timeout" | "error";

/** A checked answer to every question, or why there is none. */
export type Decided = Data.TaggedEnum<{
  Answered: { readonly model: string; readonly answers: Readonly<Record<string, Answer>> };
  Skipped: { readonly reason: SkipReason; readonly message: string };
}>;

export const Decided = Data.taggedEnum<Decided>();

export class Decisions extends Context.Service<
  Decisions,
  {
    /**
     * Asks the first available model of the preferred families every question about `state`. Never
     * fails: no model, a slow or failed call, or an answer out of range is `Skipped`.
     */
    readonly classify: (
      state: DecisionState,
      questions: Readonly<Record<string, Question>>,
      prefer: DecisionPreference,
    ) => Effect.Effect<Decided>;
  }
>()("liminal/decisions/Decisions") {}
