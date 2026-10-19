/**
 * Reads the project's checks from `.liminal/checks.json` on each use, so an edit applies from the
 * next call. An untrusted workspace has no checks.
 */

import { Duration, Effect, FileSystem, Option, Path, Result, Schema } from "effect";

import { Directories, parseJsonObject, ProjectTrust } from "@liminal/sdk";

import { type CheckEntry, ChecksFile, checksFileName, ChecksFileInvalid } from "../contract.ts";

const DEFAULT_TIMEOUT_SECONDS = 120;

/** Stands for the changed files a command takes as arguments. */
const FILES_PLACEHOLDER = "{files}";

/** One command, ready to run from `directory`. */
export interface Check {
  readonly name: string;
  readonly details: Option.Option<string>;
  readonly command: string;
  /** The entry as the file wrote it; a pass holds only while this is the same. */
  readonly definition: string;
  readonly takesFiles: boolean;
  readonly include: ReadonlyArray<Bun.Glob>;
  readonly exclude: ReadonlyArray<Bun.Glob>;
  readonly directory: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout: Duration.Duration;
}

/** The checks of the workspace at `root`; at least one list is not empty. */
export interface ProjectChecks {
  readonly root: string;
  readonly fix: ReadonlyArray<Check>;
  readonly check: ReadonlyArray<Check>;
  readonly commit: ReadonlyArray<Check>;
}

const decodeFile = Schema.decodeUnknownEffect(ChecksFile);

export const makeChecksFile = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { project, workspace } = yield* Directories;
  const trust = yield* ProjectTrust;
  const file = path.join(project, checksFileName);

  const invalid = (problem: string) =>
    new ChecksFileInvalid({
      message: `${file} ${problem}. Fix the file, or remove it to run without checks.`,
    });

  const checkOf = (entry: CheckEntry): Check => ({
    name: entry.name,
    details: Option.fromUndefinedOr(entry.details),
    command: entry.command,
    definition: JSON.stringify(entry),
    takesFiles: entry.command.includes(FILES_PLACEHOLDER),
    include: (entry.include ?? []).map((pattern) => new Bun.Glob(pattern)),
    exclude: (entry.exclude ?? []).map((pattern) => new Bun.Glob(pattern)),
    directory: path.resolve(workspace, entry.cwd ?? "."),
    env: entry.env ?? {},
    timeout: Duration.seconds(entry.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS),
  });

  /** None when the workspace is untrusted, has no checks file, or the file lists no commands. */
  const load = Effect.fn("Checks.load")(function* () {
    const trusted = yield* trust.trusted.pipe(Effect.orElseSucceed(() => false));
    const exists = yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false));
    if (!trusted || !exists) return Option.none<ProjectChecks>();

    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.mapError((error) => invalid(`cannot be read: ${error.message}`)));

    const parsed = parseJsonObject(text);
    if (Result.isFailure(parsed)) return yield* invalid(`is not valid JSON: ${parsed.failure}`);

    const lists = yield* decodeFile(parsed.success).pipe(
      Effect.mapError((error) => invalid(`has a wrong value: ${error.message}`)),
    );

    const checks: ProjectChecks = {
      root: workspace,
      fix: (lists.fix ?? []).map(checkOf),
      check: (lists.check ?? []).map(checkOf),
      commit: (lists.commit ?? []).map(checkOf),
    };

    const isEmpty = [checks.fix, checks.check, checks.commit].every((list) => list.length === 0);

    return isEmpty ? Option.none<ProjectChecks>() : Option.some(checks);
  });

  return { load };
});

/** The command line for `check`, with `{files}` replaced by `files`, each quoted for the shell. */
export const commandLine = (check: Check, files: ReadonlyArray<string>): string => {
  const quoted = files.map((file) => `'${file.replaceAll("'", String.raw`'\''`)}'`).join(" ");

  return check.command.replaceAll(FILES_PLACEHOLDER, quoted);
};
