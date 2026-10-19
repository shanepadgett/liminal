/** Finds the checks that apply to changed files, runs them one at a time, and words the report. */

import { Duration, Effect, FileSystem, Option, Path } from "effect";

import { CommandRunner, type CommandResult } from "@liminal/command-runner/contract";

import type { Changes, CheckReport } from "../contract.ts";
import { type Check, commandLine } from "./file.ts";

/** A check to run, with the full paths of the changed files it matches that still exist. */
export interface DueCheck {
  readonly check: Check;
  readonly files: ReadonlyArray<string>;
}

const matches = (check: Check, path: string) => {
  const isIncluded = check.include.length === 0 || check.include.some((glob) => glob.match(path));

  return isIncluded && !check.exclude.some((glob) => glob.match(path));
};

/** The output a check left, stdout then stderr. */
const outputOf = (result: CommandResult) =>
  [result.stdout.trim(), result.stderr.trim()].filter((text) => text !== "").join("\n");

/** The failure output of a run, or none when it passed. */
const failureOf = (check: Check, result: CommandResult): Option.Option<string> => {
  if (result.end.type === "timed-out") {
    const seconds = Duration.toSeconds(check.timeout);

    return Option.some(`Timed out after ${seconds} seconds.\n${outputOf(result)}`.trim());
  }

  return result.end.code === 0 ? Option.none() : Option.some(outputOf(result));
};

export const makeRunner = Effect.gen(function* () {
  const runner = yield* CommandRunner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /**
   * The checks whose globs match a changed path. With changes unknown every check is due with no
   * files; a check that takes files and has none left, because they were deleted, is skipped.
   */
  const dueChecks = Effect.fn("Checks.due")(function* (
    checks: ReadonlyArray<Check>,
    root: string,
    changes: Changes,
  ) {
    if (changes.type === "unknown") return checks.map((check): DueCheck => ({ check, files: [] }));

    const existing = yield* Effect.filter(changes.paths, (file) =>
      fs.exists(path.join(root, file)).pipe(Effect.orElseSucceed(() => false)),
    );

    return checks.flatMap((check): ReadonlyArray<DueCheck> => {
      const isMatched = changes.paths.some((file) => matches(check, file));

      const files = existing.flatMap((file) =>
        matches(check, file) ? [path.join(root, file)] : [],
      );

      const hasNothingToRun = !isMatched || (check.takesFiles && files.length === 0);

      return hasNothingToRun ? [] : [{ check, files }];
    });
  });

  const failureOfRun = ({ check, files }: DueCheck) =>
    runner
      .run({
        command: commandLine(check, files),
        cwd: check.directory,
        timeout: check.timeout,
        env: check.env,
      })
      .pipe(
        Effect.map((result) => failureOf(check, result)),
        Effect.catch((error) => Effect.succeedSome(error.message)),
      );

  /** Runs each check in order; a check passes when its command exits with code 0. */
  const runChecks = Effect.fn("Checks.run")(function* (due: ReadonlyArray<DueCheck>) {
    const outcomes = yield* Effect.forEach(due, (one) =>
      Effect.map(failureOfRun(one), (failure) => ({ name: one.check.name, failure })),
    );

    const report: CheckReport = {
      passed: outcomes.flatMap(({ name, failure }) => (Option.isNone(failure) ? [name] : [])),
      failed: outcomes.flatMap(({ name, failure }) =>
        Option.toArray(Option.map(failure, (output) => ({ name, output }))),
      ),
    };

    return report;
  });

  return { dueChecks, runChecks };
});

/** `Passed: name` for each pass, then `Failed: name` and its output for each failure. */
export const reportText = (report: CheckReport): string =>
  [
    ...report.passed.map((name) => `Passed: ${name}`),
    ...report.failed.map(({ name, output }) => `Failed: ${name}\n${output}`.trim()),
  ].join("\n\n");
