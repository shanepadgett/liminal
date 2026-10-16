/**
 * A reply as the rows a style draws: each entry on its own, except neighboring entries that a group
 * rule names, which fold into one group row.
 */

import type { TranscriptEntry } from "./entries.ts";
import type { GroupRule } from "./levels.ts";

export type GroupedEntries = readonly [TranscriptEntry, TranscriptEntry, ...TranscriptEntry[]];

export type Row =
  | { readonly kind: "entry"; readonly entry: TranscriptEntry }
  | { readonly kind: "group"; readonly rule: GroupRule; readonly entries: GroupedEntries };

type Run = { readonly rule: GroupRule; readonly entries: TranscriptEntry[] };

const ruleFor = (entry: TranscriptEntry, rules: readonly GroupRule[]): GroupRule | undefined =>
  rules.find((rule) => rule.kinds.includes(entry.kind));

/** A run of one entry stays a plain entry; there is nothing to fold it with. */
const rowsOfRun = (run: Run): readonly Row[] => {
  const [first, second, ...rest] = run.entries;

  if (first === undefined) return [];
  if (second === undefined) return [{ kind: "entry", entry: first }];

  return [{ kind: "group", rule: run.rule, entries: [first, second, ...rest] }];
};

/** Splits a turn into runs: neighbors under one rule share a run; other entries stand alone. */
const runsOf = (
  reply: readonly TranscriptEntry[],
  rules: readonly GroupRule[],
): readonly (Run | TranscriptEntry)[] => {
  const runs: (Run | TranscriptEntry)[] = [];

  for (const entry of reply) {
    const rule = ruleFor(entry, rules);
    const last = runs.at(-1);

    if (rule === undefined) {
      runs.push(entry);
    } else if (last !== undefined && "rule" in last && last.rule === rule) {
      last.entries.push(entry);
    } else {
      runs.push({ rule, entries: [entry] });
    }
  }

  return runs;
};

export const foldRows = (
  reply: readonly TranscriptEntry[],
  rules: readonly GroupRule[],
): readonly Row[] =>
  runsOf(reply, rules).flatMap((run): readonly Row[] =>
    "rule" in run ? rowsOfRun(run) : [{ kind: "entry", entry: run }],
  );
