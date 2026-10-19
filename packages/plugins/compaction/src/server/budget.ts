/** How full a session's context is: the budget, the size of the view and the stage it reached. */

import { Option, Schema } from "effect";

import type { Entry, ModelContent, ModelPart } from "@liminal/sdk";
import { Finish } from "@liminal/session-log/contract";

/** Tokens kept free below the context window for the reply. */
const RESERVE = 16_000;

/** Characters per token in estimates. */
const CHARS_PER_TOKEN = 4;

/** The most tokens a request may hold: the window less the reserve, at most the setting. */
export const budgetOf = (contextWindow: number, setting: number): number =>
  Math.min(contextWindow - RESERVE, setting);

const partChars = (part: ModelPart): number =>
  part.type === "text" || part.type === "reasoning"
    ? part.text.length
    : JSON.stringify(part).length;

const contentChars = (content: ReadonlyArray<ModelContent>) => {
  let chars = 0;
  for (const message of content) for (const part of message.parts) chars += partChars(part);

  return chars;
};

/** The estimated tokens of an entry's model content. */
export const tokensOf = (entry: Pick<Entry, "model">): number =>
  Math.ceil(contentChars(entry.model ?? []) / CHARS_PER_TOKEN);

/** The estimated tokens of a text. */
export const textTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

const decodeFinish = Schema.decodeUnknownOption(Schema.Struct({ finish: Finish }));

/** The finish saved on a reply's last part. */
export const finishOf = (entry: Entry): Option.Option<Finish> =>
  Option.map(decodeFinish(entry.data), ({ finish }) => finish);

/** The estimated tokens of every entry's model content. */
export const sumTokens = (entries: ReadonlyArray<Pick<Entry, "model">>): number => {
  let tokens = 0;
  for (const entry of entries) tokens += tokensOf(entry);

  return tokens;
};

/**
 * The view's size in tokens: the last reply's usage, plus estimates for the entries after it. A
 * reply at or before `since`, such as one before a checkpoint, measured another view, so it is left
 * out.
 */
export const sizeOf = (view: ReadonlyArray<Entry>, since: number): number => {
  for (let index = view.length - 1; index >= 0; index -= 1) {
    const entry = view[index];
    if (entry === undefined || entry.seq <= since) break;

    const finish = finishOf(entry);
    if (Option.isNone(finish)) continue;

    const { usage } = finish.value;

    return (
      usage.input
      + usage.cacheRead
      + usage.cacheWrite
      + usage.output
      + sumTokens(view.slice(index + 1))
    );
  }

  return sumTokens(view);
};

/** How full the context is, in order. */
export const STAGES = ["none", "notice", "warning", "forced"] as const;

export type Stage = (typeof STAGES)[number];

/** The share of the budget at which each stage starts. */
const STARTS: Readonly<Record<Exclude<Stage, "none">, number>> = {
  notice: 0.5,
  warning: 0.75,
  forced: 1,
};

/** The highest stage the size reached. */
export const stageOf = (size: number, budget: number): Stage =>
  STAGES.findLast((stage) => stage === "none" || size >= STARTS[stage] * budget) ?? "none";

/** Whether `stage` is at or past `other`. */
export const isAtLeast = (stage: Stage, other: Stage): boolean =>
  STAGES.indexOf(stage) >= STAGES.indexOf(other);
