/**
 * A run of thoughts and tool calls as rows: each call worded by its tool's `fold`, consecutive
 * calls whose rows join on the same label gathered into one row (`Read 3 files`), and each thought
 * a row of its own.
 */

import { Predicate } from "effect";

import { thoughtWording, type WorkWording } from "@liminal/sdk/tui";

import type { ToolCall, ToolRows, WorkRow } from "../contract.ts";
import type { Step } from "./transcript-state.ts";

/** A row of calls; a joined row lists the calls it gathered. */
export interface CallsGroup {
  readonly kind: "calls";
  readonly words: WorkWording;
  readonly calls: ReadonlyArray<{ readonly call: ToolCall; readonly words: WorkWording }>;
}

/** A thought's row: its title, opening to the whole thought. */
export interface ThoughtGroup {
  readonly kind: "thought";
  readonly words: WorkWording;
  readonly text: string;
}

/** One drawn row. */
export type WorkGroup = CallsGroup | ThoughtGroup;

const failureOf = (call: ToolCall) =>
  call.outcome === undefined || call.outcome.status === "done" ? "" : call.outcome.status;

/** A call no tool words reads as its tool's name; a call whose tool is `Hidden` has no row. */
const rowOf = (call: ToolCall, rows: ToolRows | undefined): WorkRow | undefined => {
  if (rows === undefined) return { label: call.name, subject: "" };

  return Predicate.isTagged(rows, "Rows") ? rows.fold(call) : undefined;
};

const wordedOf = (call: ToolCall, row: WorkRow): WorkWording => ({
  label: row.label,
  subject: row.subject,
  detail: row.detail ?? "",
  failure: failureOf(call),
  oneLine: row.oneLine === true,
  isRunning: call.outcome === undefined,
});

const joinedWords = (
  joins: NonNullable<WorkRow["joins"]>,
  calls: CallsGroup["calls"],
): WorkWording => {
  const failed = calls.filter(({ words }) => words.failure !== "").length;

  return {
    label: joins.label,
    subject: `${calls.length} ${joins.noun}`,
    detail: "",
    failure: failed === 0 ? "" : `${failed} failed`,
    oneLine: false,
    isRunning: calls.some(({ call }) => call.outcome === undefined),
  };
};

type Called = CallsGroup["calls"][number];

/** Consecutive calls that join; `joins` is absent for a call that joins nothing. */
interface Run {
  readonly joins: WorkRow["joins"];
  readonly first: Called;
  readonly rest: Array<Called>;
}

const groupOf = (run: Run): CallsGroup => {
  const calls = [run.first, ...run.rest];

  return run.joins === undefined || run.rest.length === 0
    ? { kind: "calls", words: run.first.words, calls }
    : { kind: "calls", words: joinedWords(run.joins, calls), calls };
};

const thoughtOf = (text: string): ThoughtGroup => ({
  kind: "thought",
  words: thoughtWording(text),
  text,
});

/** Adds a call to the last run when both join on the same label, else starts a run. */
const addCall = (groups: Array<WorkGroup | Run>, called: Called, joins: WorkRow["joins"]) => {
  const last = groups.at(-1);

  if (
    last !== undefined
    && "first" in last
    && last.joins !== undefined
    && last.joins.label === joins?.label
  ) {
    last.rest.push(called);
  } else {
    groups.push({ joins, first: called, rest: [] });
  }
};

/**
 * The steps' rows, leaving out calls whose tool is `Hidden`; `rowsOf` finds a tool's registration
 * by name. A thought ends a run of joined calls; with `joinsCalls` off, every call keeps its own
 * row.
 */
export const groupsOf = (
  steps: ReadonlyArray<Step>,
  rowsOf: (name: string) => ToolRows | undefined,
  joinsCalls = true,
): ReadonlyArray<WorkGroup> => {
  const groups: Array<WorkGroup | Run> = [];

  for (const step of steps) {
    if (step.kind === "thought") {
      groups.push(thoughtOf(step.text));
      continue;
    }

    const row = rowOf(step.call, rowsOf(step.call.name));

    if (row === undefined) continue;

    const called = { call: step.call, words: wordedOf(step.call, row) };
    addCall(groups, called, joinsCalls ? row.joins : undefined);
  }

  return groups.map((each) => ("first" in each ? groupOf(each) : each));
};
