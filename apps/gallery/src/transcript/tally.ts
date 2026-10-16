/**
 * What a folded run of work did, in words for its one line: the action going on now while it is
 * live, then what is finished. Edits lead, since they are what the user checks afterwards; the rest
 * follow in the order they first happened. Thinking adds its time but is never counted.
 */

import { Match } from "effect";

import { formatDuration } from "./duration.ts";
import type { EditCall, ThinkingEntry, ToolCall, TranscriptEntry } from "./entries.ts";
import { isToolCall } from "./entries.ts";
import { countOf } from "./results/edit.tsx";
import { faceOf } from "./results/faceOf.ts";

export type Tally = {
  /** The action going on now, while the run is the turn's current action. */
  readonly current: string | undefined;
  /** How long the current action has run, once that is long enough to be worth saying. */
  readonly currentSeconds: number | undefined;
  /** Each finished kind of work, lowercase: `read 2 files`. */
  readonly parts: readonly string[];
  readonly failures: number;
};

/** A running call shows its time only after this many seconds, so quick calls stay quiet. */
const ELAPSED_AFTER_SECONDS = 3;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const fileName = (path: string) => path.split("/").at(-1) ?? path;

/** A thought's first sentence, enough to say what it is about. */
const titleOf = (thinking: ThinkingEntry) => thinking.text.split(/(?<=\.)\s/)[0] ?? thinking.text;

const currentOf = (entry: TranscriptEntry): string | undefined => {
  if (entry.kind === "thinking") return `Thinking: ${titleOf(entry)}`;
  if (!isToolCall(entry) || entry.outcome.status !== "running") return undefined;

  const face = faceOf(entry);

  return `${face.activeVerb} ${face.subject}`.trimEnd();
};

const secondsOf = (entry: TranscriptEntry): number | undefined =>
  isToolCall(entry)
  && entry.outcome.status === "running"
  && entry.outcome.seconds >= ELAPSED_AFTER_SECONDS
    ? entry.outcome.seconds
    : undefined;

/** Only edits that landed count; a failed one changed nothing. */
const editsPart = (edits: readonly EditCall[]): readonly string[] => {
  const landed = edits.flatMap((edit) =>
    edit.outcome.status === "done" ? [{ path: edit.path, diff: edit.outcome.result.diff }] : [],
  );

  const paths = [...new Set(landed.map((edit) => edit.path))];
  const [onlyPath] = paths;
  if (onlyPath === undefined) return [];

  let added = 0;
  let removed = 0;

  for (const edit of landed) {
    added += countOf(edit.diff, "added");
    removed += countOf(edit.diff, "removed");
  }

  const files = paths.length === 1 ? fileName(onlyPath) : plural(paths.length, "file");

  return [`edited ${files} +${added} -${removed}`];
};

/** The words for every finished call of one tool other than edit. */
const callsPart = (kind: Exclude<ToolCall["kind"], "edit">, count: number): string =>
  Match.value(kind).pipe(
    Match.when("read", () => `read ${plural(count, "file")}`),
    Match.when("search", () => `searched ${plural(count, "pattern")}`),
    Match.when("run", () => `ran ${plural(count, "command")}`),
    Match.when("checks", () => "ran checks"),
    Match.when("ask", () => `answered ${plural(count, "question")}`),
    Match.exhaustive,
  );

const otherCallsParts = (calls: readonly ToolCall[]): readonly string[] => {
  const counts = new Map<Exclude<ToolCall["kind"], "edit">, number>();

  for (const call of calls) {
    if (call.kind !== "edit") counts.set(call.kind, (counts.get(call.kind) ?? 0) + 1);
  }

  return [...counts].map(([kind, count]) => callsPart(kind, count));
};

/** The time spent thinking. */
const timeParts = (entries: readonly TranscriptEntry[]): readonly string[] => {
  let thought = 0;

  for (const entry of entries) {
    if (entry.kind === "thinking") thought += entry.seconds;
  }

  return thought === 0 ? [] : [`thought ${formatDuration(thought)}`];
};

export const tallyOf = (entries: readonly TranscriptEntry[], isLive: boolean): Tally => {
  const last = entries.at(-1);
  const current = isLive && last !== undefined ? currentOf(last) : undefined;
  const finished = current === undefined ? entries : entries.slice(0, -1);
  const calls = finished.filter(isToolCall).filter((call) => call.outcome.status !== "running");

  const work = [
    ...editsPart(calls.filter((call): call is EditCall => call.kind === "edit")),
    ...otherCallsParts(calls),
  ];

  return {
    current,
    currentSeconds: current === undefined || last === undefined ? undefined : secondsOf(last),
    parts: [...work, ...timeParts(finished)],
    failures: calls.filter((call) => call.outcome.status === "failed").length,
  };
};
