/**
 * A run of tool calls as rows: each call worded by its tool's `fold`, and consecutive calls whose
 * rows join on the same verb gathered into one row (`Explored 3 files`).
 */

import type { ToolCall, ToolRows, WorkRow } from "../contract.ts";

/** A row's words as drawn: `failure` is set once a call ended any way but `done`. */
export interface Worded {
  readonly verb: string;
  readonly subject: string;
  readonly detail: string;
  readonly failure: string;
}

/** One drawn row; a joined row lists the calls it gathered. */
export interface WorkGroup {
  readonly words: Worded;
  readonly calls: ReadonlyArray<{ readonly call: ToolCall; readonly words: Worded }>;
}

const failureOf = (call: ToolCall) =>
  call.outcome === undefined || call.outcome.status === "done" ? "" : call.outcome.status;

/** A call no tool words reads as its tool's name. */
const rowOf = (call: ToolCall, rows: ToolRows | undefined): WorkRow =>
  rows?.fold(call) ?? { verb: call.name, subject: "" };

const wordedOf = (call: ToolCall, row: WorkRow): Worded => ({
  verb: row.verb,
  subject: row.subject,
  detail: row.detail ?? "",
  failure: failureOf(call),
});

const joinedWords = (joins: NonNullable<WorkRow["joins"]>, calls: WorkGroup["calls"]): Worded => {
  const failed = calls.filter(({ words }) => words.failure !== "").length;

  return {
    verb: joins.verb,
    subject: `${calls.length} ${joins.noun}`,
    detail: "",
    failure: failed === 0 ? "" : `${failed} failed`,
  };
};

type Called = WorkGroup["calls"][number];

/** Consecutive calls that join; `joins` is absent for a call that joins nothing. */
interface Run {
  readonly joins: WorkRow["joins"];
  readonly first: Called;
  readonly rest: Array<Called>;
}

const groupOf = (run: Run): WorkGroup => {
  const calls = [run.first, ...run.rest];

  return run.joins === undefined || run.rest.length === 0
    ? { words: run.first.words, calls }
    : { words: joinedWords(run.joins, calls), calls };
};

/** The calls' rows; `rowsOf` finds a tool's registration by name. */
export const groupsOf = (
  calls: ReadonlyArray<ToolCall>,
  rowsOf: (name: string) => ToolRows | undefined,
): ReadonlyArray<WorkGroup> => {
  const runs: Array<Run> = [];

  for (const call of calls) {
    const row = rowOf(call, rowsOf(call.name));
    const last = runs.at(-1);
    const words = wordedOf(call, row);

    if (last?.joins !== undefined && last.joins.verb === row.joins?.verb) {
      last.rest.push({ call, words });
    } else {
      runs.push({ joins: row.joins, first: { call, words }, rest: [] });
    }
  }

  return runs.map(groupOf);
};
