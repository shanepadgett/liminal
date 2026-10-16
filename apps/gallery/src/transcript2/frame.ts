/**
 * What a turn shows at one moment of its script. Finished beats settle into blocks: what the
 * assistant said and the groups of work it did. The beat going on now is the tip; an action joins
 * the group it carries on, which shows on the live line until the group is over. Work dims once the
 * assistant speaks after it, and all of it dims once the turn's work is over. Once the work is
 * over, the turn ends with how long it worked and its close: the answer, or the form of questions
 * it drafted.
 */

import type { Action } from "./script.ts";
import type { Group } from "./workGroups.ts";

/** Text arriving a character at a time, `progress` of the way out, from 0 to 1. */
export type Streaming = { readonly text: string; readonly progress: number };

export type Block =
  | ({ readonly kind: "said" } & Streaming)
  | {
      readonly kind: "work";
      readonly groups: readonly Group[];
      /** How far the work has dimmed, from 0 to 1, once the assistant spoke after it or finished. */
      readonly dim: number;
    };

export type Tip =
  | ({ readonly kind: "thinking"; readonly seconds: number } & Streaming)
  | {
      readonly kind: "acting";
      /** The group the action is part of, the action included. */
      readonly group: Group;
      readonly action: Action;
      /** How far through the action it is, from 0 to 1. */
      readonly progress: number;
      readonly seconds: number;
    }
  /** Writing the form of questions the turn closes with; the user answers it in the composer. */
  | { readonly kind: "drafting"; readonly seconds: number }
  /** Nothing to draw: the assistant is talking, or the turn is over. */
  | { readonly kind: "quiet" };

/** What the turn left the user: its answer, or the questions waiting for them. */
export type Final =
  | { readonly kind: "answer"; readonly answer: Streaming }
  | { readonly kind: "questions"; readonly title: string; readonly count: number };

export type Ending = {
  readonly seconds: number;
  /** How far the worked line has inked in, from 0 to 1. */
  readonly drawn: number;
  readonly final: Final;
};

export type TurnFrame = {
  /** Playback time into the turn. */
  readonly ms: number;
  readonly blocks: readonly Block[];
  readonly tip: Tip;
  readonly ending: Ending | undefined;
};
