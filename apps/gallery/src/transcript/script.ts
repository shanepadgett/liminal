/**
 * A turn as a script the gallery plays: the user's prompt, timed beats of the assistant thinking,
 * saying something and acting, then how the turn closes: an answer, or a form of questions for the
 * user. Every beat lasts `ms` of playback, and the times the transcript shows are playback time, so
 * what plays is what it says.
 */

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
  /** The model read back entries a checkpoint folded away. */
  | { readonly kind: "recall"; readonly from: number; readonly through: number };

export type Beat =
  | { readonly kind: "think"; readonly text: string; readonly ms: number }
  | { readonly kind: "say"; readonly text: string; readonly ms: number }
  | { readonly kind: "act"; readonly action: Action; readonly ms: number };

export type AnswerOption = { readonly label: string; readonly description?: string };

/** The answer the assistant suggests and why. */
export type Recommendation = { readonly answer: string; readonly reason: string };

/** A question the assistant puts to the user: pick an option, say yes or no, or write an answer. */
export type Question =
  | {
      readonly kind: "select";
      readonly prompt: string;
      readonly options: readonly AnswerOption[];
      readonly recommendation?: Recommendation;
    }
  | { readonly kind: "confirm"; readonly prompt: string; readonly recommendation?: Recommendation }
  | { readonly kind: "input"; readonly prompt: string; readonly recommendation?: Recommendation };

/** A note the user left on one of a question's options, picked or not. */
export type Note = { readonly option: string; readonly text: string };

/**
 * How the user answered: picked an option, typed their own in place of the options, wrote one, or
 * skipped the question.
 */
export type Answer =
  | { readonly kind: "picked"; readonly option: string; readonly notes: readonly Note[] }
  | { readonly kind: "own"; readonly text: string; readonly notes: readonly Note[] }
  | { readonly kind: "written"; readonly text: string }
  | { readonly kind: "skipped" };

export type Answered = { readonly question: Question; readonly answer: Answer };

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
