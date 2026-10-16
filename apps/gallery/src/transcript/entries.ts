/**
 * What a session's transcript holds, as data. Each entry has a kind that a style gives a level, and
 * an id so a row can be shown expanded. A tool call is running, done with a result, or failed with
 * an error and whatever output it left.
 */

export type Outcome<Result> =
  | { readonly status: "running" }
  | { readonly status: "done"; readonly result: Result }
  | { readonly status: "failed"; readonly error: string; readonly output: readonly string[] };

export type ToolStatus = Outcome<never>["status"];

export type ReadCall = {
  readonly kind: "read";
  readonly id: string;
  readonly path: string;
  readonly outcome: Outcome<{ readonly excerpt: readonly string[]; readonly totalLines: number }>;
};

export type DiffLine = {
  readonly change: "added" | "removed" | "kept";
  readonly number: number;
  readonly text: string;
};

export type EditCall = {
  readonly kind: "edit";
  readonly id: string;
  readonly path: string;
  readonly outcome: Outcome<{ readonly diff: readonly DiffLine[] }>;
};

export type RunCall = {
  readonly kind: "run";
  readonly id: string;
  readonly command: string;
  readonly outcome: Outcome<{ readonly output: readonly string[]; readonly hiddenLines: number }>;
};

export type SearchMatch = { readonly path: string; readonly line: number; readonly text: string };

export type SearchCall = {
  readonly kind: "search";
  readonly id: string;
  readonly pattern: string;
  readonly scope: string;
  readonly outcome: Outcome<{ readonly matches: readonly SearchMatch[] }>;
};

export type CheckResult = {
  readonly name: string;
  readonly hasPassed: boolean;
  readonly summary: string;
};

export type ChecksCall = {
  readonly kind: "checks";
  readonly id: string;
  readonly outcome: Outcome<{ readonly checks: readonly CheckResult[] }>;
};

export type AskCall = {
  readonly kind: "ask";
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly outcome: Outcome<{ readonly answer: string }>;
};

export type ToolCall = ReadCall | EditCall | RunCall | SearchCall | ChecksCall | AskCall;

export type ToolKind = ToolCall["kind"];

const TOOL_KINDS: Readonly<Record<ToolKind, true>> = {
  read: true,
  edit: true,
  run: true,
  search: true,
  checks: true,
  ask: true,
};

export type ThinkingEntry = {
  readonly kind: "thinking";
  readonly id: string;
  readonly text: string;
  readonly seconds: number;
};

export type TranscriptEntry =
  | { readonly kind: "user"; readonly id: string; readonly text: string }
  | {
      readonly kind: "thinking";
      readonly id: string;
      readonly text: string;
      readonly seconds: number;
    }
  /** A message the assistant writes between actions, before its answer. */
  | { readonly kind: "interim"; readonly id: string; readonly text: string }
  | { readonly kind: "answer"; readonly id: string; readonly text: string }
  /** How long the assistant worked on the turn, written once the turn ends. */
  | { readonly kind: "worked"; readonly id: string; readonly seconds: number }
  | ToolCall;

export type EntryKind = TranscriptEntry["kind"];

/** One user message and everything the assistant did in reply. */
export type Turn = readonly TranscriptEntry[];

export const isToolCall = (entry: TranscriptEntry): entry is ToolCall => entry.kind in TOOL_KINDS;
