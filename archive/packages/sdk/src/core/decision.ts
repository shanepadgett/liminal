/**
 * Questions a decision model answers about a JSON state, with probabilities: pick one of several
 * choices, place it on a scale, or say whether something is true.
 */

import { Schema } from "effect";

/** Pick one of `criteria`'s keys; each value says what that choice means. */
export const ChoiceQuestion = Schema.TaggedStruct("Choice", {
  instructions: Schema.String,
  criteria: Schema.Record(Schema.String, Schema.String),
});

/** Place the state on a scale whose levels are `criteria`, lowest first. */
export const ScoreQuestion = Schema.TaggedStruct("Score", {
  instructions: Schema.String,
  criteria: Schema.Array(Schema.String),
});

/** Say whether something is true; `criteria` says what true and false each mean. */
export const BoolQuestion = Schema.TaggedStruct("Bool", {
  instructions: Schema.String,
  criteria: Schema.Struct({ true: Schema.String, false: Schema.String }),
});

export const Question = Schema.Union([ChoiceQuestion, ScoreQuestion, BoolQuestion]);

export type Question = typeof Question.Type;

/** The chosen key, each key's probability, and how sure the model is, from 0 to 1. */
export const ChoiceAnswer = Schema.TaggedStruct("Choice", {
  choice: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
  confidence: Schema.Finite,
});

/** The level as a number from 0 to 1, and how sure the model is. */
export const ScoreAnswer = Schema.TaggedStruct("Score", {
  score: Schema.Finite,
  confidence: Schema.Finite,
});

/** The probability that the statement is true. */
export const BoolAnswer = Schema.TaggedStruct("Bool", { probability: Schema.Finite });

export const Answer = Schema.Union([ChoiceAnswer, ScoreAnswer, BoolAnswer]);

export type Answer = typeof Answer.Type;

/** The state a decision model reads: named JSON values. */
export type DecisionState = Readonly<Record<string, Schema.Json>>;

/** A decision model call that did not answer: no key, a failed request, a refusal, a bad reply. */
export class DecisionFailed extends Schema.TaggedError<
  DecisionFailed,
  { readonly brand: unique symbol }
>()("DecisionFailed", { message: Schema.String }) {}
