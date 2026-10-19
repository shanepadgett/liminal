/**
 * Checks: the project's own commands from `.liminal/checks.json`. Fixers run on the files each
 * writing call changed; checks run on demand through the `checks` tool and when a turn would end
 * with unchecked changes; commit checks run only in `/commit`.
 */

import { Schema } from "effect";

import { defineEntry } from "@liminal/sdk";

/** The checks file's name in the project folder. */
export const checksFileName = "checks.json";

/** One command. `include` and `exclude` are globs on paths from the workspace. */
export const CheckEntry = Schema.Struct({
  name: Schema.NonEmptyString,
  /** `{files}` stands for the matching changed files, which the command then takes as arguments. */
  command: Schema.NonEmptyString,
  details: Schema.optionalKey(Schema.String),
  include: Schema.optionalKey(Schema.Array(Schema.String)),
  exclude: Schema.optionalKey(Schema.Array(Schema.String)),
  /** From the workspace; missing is the workspace. */
  cwd: Schema.optionalKey(Schema.String),
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  timeoutSeconds: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
});

export type CheckEntry = typeof CheckEntry.Type;

/** `fix` runs on changed files after each writing call; `commit` runs only in `/commit`. */
export const ChecksFile = Schema.Struct({
  fix: Schema.optionalKey(Schema.Array(CheckEntry)),
  check: Schema.optionalKey(Schema.Array(CheckEntry)),
  commit: Schema.optionalKey(Schema.Array(CheckEntry)),
});

export type ChecksFile = typeof ChecksFile.Type;

/** The files a call changed, from the workspace, or unknown when git could not tell. */
export const Changes = Schema.Union([
  Schema.Struct({ type: Schema.Literal("files"), paths: Schema.Array(Schema.String) }),
  Schema.Struct({ type: Schema.Literal("unknown") }),
]);

export type Changes = typeof Changes.Type;

/** One run of checks: the names that passed, and each failure with its output. */
export const CheckReport = Schema.Struct({
  passed: Schema.Array(Schema.String),
  failed: Schema.Array(Schema.Struct({ name: Schema.String, output: Schema.String })),
});

export type CheckReport = typeof CheckReport.Type;

/** What a writing call changed; read back to find the checks due. */
export const ChangesEntry = defineEntry({
  kind: "checks/changes",
  data: Changes,
  model: false,
  user: "hidden",
});

/** Fixers that ran after a call, and any that failed. */
export const FixedEntry = defineEntry({
  kind: "checks/fixed",
  data: CheckReport,
  model: false,
  user: "debug",
});

/** A report from checks run when the turn would end; the model reads it as a message. */
export const ReportEntry = defineEntry({
  kind: "checks/report",
  data: CheckReport,
  model: true,
  user: "shown",
});

/** The tool the model calls to run the checks. */
export const checksTool = "checks";

/** Whether a report has a failure. */
export const hasFailures = (report: CheckReport): boolean => report.failed.length > 0;
