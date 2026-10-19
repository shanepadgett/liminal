/**
 * A turn as a script the gallery plays: the user's prompt, timed beats of the assistant thinking,
 * saying something and acting, then how the turn closes: an answer, or a form of questions for the
 * user. Every beat lasts `ms` of playback, and the times the transcript shows are playback time, so
 * what plays is what it says.
 */

import type { Answered, Question } from "@liminal/questions/contract";

export type DiffLine = { readonly change: "added" | "removed" | "kept"; readonly text: string };

export type Check = { readonly name: string; readonly hasPassed: boolean };

export type Action =
  | { readonly kind: "read"; readonly path: string }
  | { readonly kind: "search"; readonly pattern: string; readonly hits: number }
  | {
      readonly kind: "run";
      readonly command: string;
      readonly output: readonly string[];
      readonly hasPassed: boolean;
    }
  | { readonly kind: "edit"; readonly path: string; readonly diff: readonly DiffLine[] }
  | { readonly kind: "checks"; readonly checks: readonly Check[] }
  /** A script the model ran, and the tool calls it made, each its own action. */
  | { readonly kind: "script"; readonly code: string; readonly calls: readonly Action[] }
  /** A web search and how many sources it gave. */
  | { readonly kind: "websearch"; readonly query: string; readonly sources: number }
  /** A web page read as text. */
  | { readonly kind: "webfetch"; readonly url: string }
  /** The model read back entries a checkpoint folded away. */
  | { readonly kind: "recall"; readonly from: number; readonly through: number }
  /**
   * A call on a long-running command: starting it, waiting on it, typing into it or stopping it,
   * with the words it reads as while it runs and once done, and the command's state after.
   */
  | {
      readonly kind: "process";
      readonly doing: string;
      readonly done: string;
      readonly subject: string;
      readonly state: string;
    };

export type Beat =
  | { readonly kind: "think"; readonly text: string; readonly ms: number }
  | { readonly kind: "say"; readonly text: string; readonly ms: number }
  | { readonly kind: "act"; readonly action: Action; readonly ms: number };

/** What the user sent: words of their own, or their answers to the assistant's questions. */
export type Prompt =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "answers";
      readonly title: string;
      readonly answered: readonly Answered[];
      /** What else the user wanted the assistant to know, or empty. */
      readonly context: string;
    };

/** How the turn closes: an answer streamed in, or a form of questions drafted over `ms`. */
export type Close =
  | { readonly kind: "answer"; readonly text: string; readonly ms: number }
  | {
      readonly kind: "questions";
      readonly title: string;
      readonly questions: readonly Question[];
      readonly ms: number;
    };

export type Script = {
  readonly prompt: Prompt;
  readonly beats: readonly Beat[];
  readonly close: Close;
};
