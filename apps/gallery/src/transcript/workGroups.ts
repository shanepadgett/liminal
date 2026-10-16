/**
 * The work between two things the assistant said, gathered into groups that each read as one row: a
 * thought, a run of reads and searches explored together, a run of edits, a command, or a checks
 * run. Reads and searches in a row join one group, and so do edits in a row.
 */

import type { Action, Check } from "./script.ts";

/** A finished piece of work: a thought and how long it took, or an action. */
export type Work =
  | { readonly kind: "thought"; readonly text: string; readonly seconds: number }
  | { readonly kind: "action"; readonly action: Action };

export type Looked = Extract<Action, { readonly kind: "read" | "search" }>;

export type Edit = Extract<Action, { readonly kind: "edit" }>;

export type Run = Extract<Action, { readonly kind: "run" }>;

export type WorkGroup =
  | { readonly kind: "thought"; readonly text: string; readonly seconds: number }
  | { readonly kind: "explored"; readonly actions: readonly Looked[] }
  | { readonly kind: "edited"; readonly edits: readonly Edit[] }
  | { readonly kind: "ran"; readonly run: Run }
  | { readonly kind: "checked"; readonly checks: readonly Check[] };

const groupOf = (work: Work): WorkGroup => {
  if (work.kind === "thought") return work;

  const { action } = work;

  if (action.kind === "read" || action.kind === "search") {
    return { kind: "explored", actions: [action] };
  }

  if (action.kind === "edit") return { kind: "edited", edits: [action] };
  if (action.kind === "run") return { kind: "ran", run: action };

  return { kind: "checked", checks: action.checks };
};

/** The two groups as one, when the second carries on the first. */
const joined = (last: WorkGroup, next: WorkGroup): WorkGroup | undefined => {
  if (last.kind === "explored" && next.kind === "explored") {
    return { kind: "explored", actions: [...last.actions, ...next.actions] };
  }

  if (last.kind === "edited" && next.kind === "edited") {
    return { kind: "edited", edits: [...last.edits, ...next.edits] };
  }

  return undefined;
};

export const groupsOf = (work: readonly Work[]): readonly WorkGroup[] => {
  const groups: WorkGroup[] = [];

  for (const each of work) {
    const next = groupOf(each);
    const last = groups.at(-1);
    const both = last === undefined ? undefined : joined(last, next);

    if (both === undefined) groups.push(next);
    else groups[groups.length - 1] = both;
  }

  return groups;
};

/**
 * The groups of the work so far, apart from the one the next piece of work is part of: the last
 * group with it joined on, or a group of its own.
 */
export const withLive = (
  work: readonly Work[],
  next: Work,
): { readonly settled: readonly WorkGroup[]; readonly live: WorkGroup } => {
  const groups = groupsOf(work);
  const own = groupOf(next);
  const last = groups.at(-1);
  const both = last === undefined ? undefined : joined(last, own);

  return both === undefined
    ? { settled: groups, live: own }
    : { settled: groups.slice(0, -1), live: both };
};
