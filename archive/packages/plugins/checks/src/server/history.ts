/** What this turn's entries say about checks: the files changed, and whether checks are due. */

import { Option, Schema } from "effect";

import type { Entry } from "@liminal/sdk";
import { ToolResultEntry, TurnStartedEntry } from "@liminal/session-log/contract";

import { type Changes, ChangesEntry, checksTool, hasFailures, ReportEntry } from "../contract.ts";

const decodeChanges = Schema.decodeUnknownOption(ChangesEntry.data);
const decodeReport = Schema.decodeUnknownOption(ReportEntry.data);
const decodeResult = Schema.decodeUnknownOption(ToolResultEntry.data);

/** The entries after the latest turn start. */
export const thisTurn = (entries: ReadonlyArray<Entry>): ReadonlyArray<Entry> =>
  entries.slice(entries.findLastIndex((entry) => entry.kind === TurnStartedEntry.kind) + 1);

const changesOf = (entry: Entry): Option.Option<Changes> =>
  entry.kind === ChangesEntry.kind ? decodeChanges(entry.data) : Option.none();

const isReport = (entry: Entry): boolean => {
  if (entry.kind === ReportEntry.kind) return true;
  if (entry.kind !== ToolResultEntry.kind) return false;

  return Option.exists(decodeResult(entry.data), ({ name }) => name === checksTool);
};

/** Everything the turn changed; one unknown change makes the whole turn unknown. */
export const changesOfTurn = (turn: ReadonlyArray<Entry>): Changes => {
  const changes = turn.flatMap((entry) => Option.toArray(changesOf(entry)));
  const paths = new Set<string>();

  for (const change of changes) {
    if (change.type === "unknown") return change;

    for (const path of change.paths) paths.add(path);
  }

  return { type: "files", paths: [...paths].toSorted() };
};

/** Checks are due when the turn changed files after its last report. */
export const isDue = (turn: ReadonlyArray<Entry>): boolean => {
  const lastChange = turn.findLastIndex((entry) => Option.isSome(changesOf(entry)));

  return lastChange > turn.findLastIndex(isReport);
};

/** How many reports the turn saved itself that failed. */
export const failedReports = (turn: ReadonlyArray<Entry>): number =>
  turn.filter(
    (entry) =>
      entry.kind === ReportEntry.kind && Option.exists(decodeReport(entry.data), hasFailures),
  ).length;
