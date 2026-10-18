/**
 * The decision model's step: three questions about the call, and the rule that approves it from the
 * answers. Anything short of a clear approval hands the call on.
 */

import { Effect, Option, Predicate } from "effect";

import type { DecisionPreference, Decisions } from "@liminal/decisions/contract";
import { type Answer, BoolQuestion, ChoiceQuestion, type Question } from "@liminal/sdk";
import type { ToolCall } from "@liminal/tools/contract";

import type { DecisionModelSetting } from "../contract.ts";
import type { Recent } from "./recent.ts";

const questions: Readonly<Record<string, Question>> = {
  hidden: BoolQuestion.make({
    instructions:
      "Does the call run code whose content is not in the state, such as a script file, a package script, a build or a test run?",
    criteria: {
      true: "It runs code the state does not show",
      false: "Everything it runs is in the state",
    },
  }),
  impact: ChoiceQuestion.make({
    instructions: "What is the widest thing the call can change?",
    criteria: {
      none: "Nothing: it only reads",
      workspace: "Files inside the workspace",
      user_home: "Files in the user's home outside the workspace, or user settings",
      system: "The operating system, installed software or system settings",
      remote: "Other machines or services, such as a push, a deploy or a request that changes data",
      exposure: "Secrets or private data sent where others can read them",
    },
  }),
  intent: BoolQuestion.make({
    instructions: "Is the call part of what the user asked the agent to do?",
    criteria: {
      true: "The user's recent prompts ask for it or for work that needs it",
      false: "The user did not ask for it",
    },
  }),
};

const boolOf = (answers: Readonly<Record<string, Answer>>, key: string) => {
  const answer = answers[key];

  return Predicate.isTagged(answer, "Bool") ? Option.some(answer.probability) : Option.none();
};

const choiceOf = (answers: Readonly<Record<string, Answer>>, key: string) => {
  const answer = answers[key];

  return Predicate.isTagged(answer, "Choice") ? Option.some(answer.probabilities) : Option.none();
};

/**
 * Approves when the call likely runs no unseen code, likely stays in the workspace, and either
 * likely changes nothing or is on task.
 */
export const approves = (answers: Readonly<Record<string, Answer>>) =>
  Option.all({
    hidden: boolOf(answers, "hidden"),
    impact: choiceOf(answers, "impact"),
    intent: boolOf(answers, "intent"),
  }).pipe(
    Option.exists(({ hidden, impact, intent }) => {
      const none = impact["none"] ?? 0;
      const workspace = impact["workspace"] ?? 0;

      return hidden <= 0.5 && none + workspace >= 0.8 && (none >= 0.8 || intent >= 0.5);
    }),
  );

/** What the decision step found: the model that approved, or none. */
export type Classified = Option.Option<string>;

/** Asks the decision model; `off`, a skipped call or a hand-off is none. */
export const classify = Effect.fn("approval.classify")(function* (
  decisions: Option.Option<Decisions["Service"]>,
  setting: DecisionModelSetting,
  call: ToolCall,
  recent: Recent,
) {
  if (setting === "off" || Option.isNone(decisions)) return Option.none<string>();

  const prefer: DecisionPreference = setting;

  const state = {
    tool: call.name,
    params: call.params,
    recentUserPrompts: [...recent.prompts],
    recentAssistantTexts: [...recent.replies],
  };

  const decided = yield* decisions.value.classify(state, questions, prefer);
  if (!Predicate.isTagged(decided, "Answered")) return Option.none<string>();

  return approves(decided.answers) ? Option.some(decided.model) : Option.none<string>();
});
