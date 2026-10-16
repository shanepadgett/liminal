/**
 * A turn as the rows a style draws: each entry on its own, except neighboring tool calls that a
 * group rule names, which fold into one group row.
 */

import { type TranscriptEntry, isToolCall, type ToolCall, type Turn } from "./entries.ts";
import type { GroupRule } from "./levels.ts";

export type Row =
  | { readonly kind: "entry"; readonly entry: TranscriptEntry }
  | {
      readonly kind: "group";
      readonly rule: GroupRule;
      readonly calls: readonly [ToolCall, ToolCall, ...ToolCall[]];
    };

type Run = { readonly rule: GroupRule; readonly calls: ToolCall[] };

const ruleFor = (call: ToolCall, rules: readonly GroupRule[]): GroupRule | undefined =>
  rules.find((rule) => rule.kinds.includes(call.kind));

/** A run of one call stays a plain entry; there is nothing to fold it with. */
const rowsOfRun = (run: Run): readonly Row[] => {
  const [first, second, ...rest] = run.calls;

  if (first === undefined) return [];
  if (second === undefined) return [{ kind: "entry", entry: first }];

  return [{ kind: "group", rule: run.rule, calls: [first, second, ...rest] }];
};

/** Splits a turn into runs: neighbors under one rule share a run; other entries stand alone. */
const runsOf = (turn: Turn, rules: readonly GroupRule[]): readonly (Run | TranscriptEntry)[] => {
  const runs: (Run | TranscriptEntry)[] = [];

  for (const entry of turn) {
    const rule = isToolCall(entry) ? ruleFor(entry, rules) : undefined;
    const last = runs.at(-1);

    if (rule === undefined || !isToolCall(entry)) {
      runs.push(entry);
    } else if (last !== undefined && "rule" in last && last.rule === rule) {
      last.calls.push(entry);
    } else {
      runs.push({ rule, calls: [entry] });
    }
  }

  return runs;
};

export const foldRows = (turn: Turn, rules: readonly GroupRule[]): readonly Row[] =>
  runsOf(turn, rules).flatMap((run): readonly Row[] =>
    "rule" in run ? rowsOfRun(run) : [{ kind: "entry", entry: run }],
  );
