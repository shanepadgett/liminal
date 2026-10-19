/**
 * The file wrapper: around each allowed call of a file or shell tool, the model's own or one inside
 * `run`, records the files the call read or changed, so memories can say which files the work
 * needs. Shell calls are compared through `git status` before and after.
 */

import { Duration, Effect, FileSystem, Option, Path, Schema } from "effect";

import type { CommandRunner } from "@liminal/command-runner/contract";
import { draft } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";
import type { AllowedCall, ToolOutcome } from "@liminal/tools/contract";

import { type LineRange, type TouchedFile, TouchedEntry } from "../contract.ts";

/** Lines `read` returns when the model gives no limit. */
const READ_LIMIT = 2000;

/** How long `git status` may take before a shell call is recorded as touching nothing. */
const STATUS_TIMEOUT = Duration.seconds(10);

/** What the wrapper reads and writes with. */
export interface TouchedDeps {
  readonly log: SessionLog["Service"];
  readonly runner: CommandRunner["Service"];
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspace: string;
}

const ReadParams = Schema.Struct({
  path: Schema.String,
  offset: Schema.optionalKey(Schema.Int),
  limit: Schema.optionalKey(Schema.Int),
});

const EditParams = Schema.Struct({ path: Schema.String, newText: Schema.String });

const PathParams = Schema.Struct({ path: Schema.String });

const decodeRead = Schema.decodeUnknownOption(ReadParams);
const decodeEdit = Schema.decodeUnknownOption(EditParams);
const decodePath = Schema.decodeUnknownOption(PathParams);

/** `file` relative to the workspace; none when it lies outside. */
const relativeOf = (deps: TouchedDeps, file: string) => {
  const relative = deps.path.relative(deps.workspace, deps.path.resolve(deps.workspace, file));

  return relative === "" || relative.startsWith("..") || deps.path.isAbsolute(relative)
    ? Option.none()
    : Option.some(relative);
};

/** The lines `read` showed. */
const readRange = (params: typeof ReadParams.Type): LineRange => {
  const from = params.offset ?? 1;

  return { from, through: from + (params.limit ?? READ_LIMIT) - 1 };
};

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** The lines `newText` holds in the file after an edit; none when it is empty or gone. */
const editedRanges = (deps: TouchedDeps, file: string, newText: string) =>
  Effect.gen(function* () {
    if (newText === "") return [];

    const text = yield* deps.fs.readFileString(deps.path.resolve(deps.workspace, file));
    const index = text.indexOf(newText);
    if (index < 0) return [];

    const from = lineOf(text, index);

    return [{ from, through: from + newText.split("\n").length - 1 }];
  }).pipe(Effect.orElseSucceed(() => []));

/** A changed file's size and time, or "missing" once it is gone. */
type Stamp = string;

/** The paths `git status` lists, renames by their new path. */
export const statusPaths = (output: string): ReadonlyArray<string> => {
  const fields = output.split("\0");
  const paths: Array<string> = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index] ?? "";
    if (field.length < 4) continue;

    paths.push(field.slice(3));
    if (field[0] === "R" || field[0] === "C") index += 1;
  }

  return paths;
};

/** Each changed or untracked file with its stamp; outside a git repository, none. */
const snapshot = (deps: TouchedDeps) =>
  Effect.gen(function* () {
    const result = yield* deps.runner.run({
      command: "git status --porcelain=v1 -z --untracked-files=all",
      cwd: deps.workspace,
      timeout: STATUS_TIMEOUT,
    });

    if (result.end.type !== "exited" || result.end.code !== 0) return new Map<string, Stamp>();

    const stamps = yield* Effect.forEach(
      statusPaths(result.stdout),
      (file) =>
        deps.fs.stat(deps.path.join(deps.workspace, file)).pipe(
          Effect.map(
            (info): Stamp =>
              `${String(info.size)}:${Option.match(info.mtime, { onNone: () => "", onSome: (date) => String(date.getTime()) })}`,
          ),
          Effect.orElseSucceed((): Stamp => "missing"),
          Effect.map((stamp) => [file, stamp] as const),
        ),
      { concurrency: 16 },
    );

    return new Map(stamps);
  }).pipe(Effect.orElseSucceed(() => new Map<string, Stamp>()));

/** The paths new in `after`, or listed in both with another stamp. */
export const changedPaths = (
  before: ReadonlyMap<string, Stamp>,
  after: ReadonlyMap<string, Stamp>,
): ReadonlyArray<string> =>
  [...after].flatMap(([file, stamp]) => (before.get(file) === stamp ? [] : [file]));

const whole = (file: string): TouchedFile => ({ path: file, ranges: [], edited: true });

/** Runs `next`, then names what the call touched, by the tool's name. */
const runAndTouch = (
  deps: TouchedDeps,
  { call }: AllowedCall,
  next: Effect.Effect<ToolOutcome>,
): Effect.Effect<readonly [ToolOutcome, ReadonlyArray<TouchedFile>]> =>
  Effect.gen(function* () {
    const plain = Effect.map(next, (outcome) => [outcome, []] as const);

    switch (call.name) {
      case "read": {
        const params = Option.flatMap(decodeRead(call.params), (read) =>
          Option.map(relativeOf(deps, read.path), (file) => ({ ...read, file })),
        );

        if (Option.isNone(params)) return yield* plain;
        const outcome = yield* next;

        return [
          outcome,
          [{ path: params.value.file, ranges: [readRange(params.value)], edited: false }],
        ] as const;
      }
      case "edit": {
        const params = Option.flatMap(decodeEdit(call.params), (edit) =>
          Option.map(relativeOf(deps, edit.path), (file) => ({ ...edit, file })),
        );

        if (Option.isNone(params)) return yield* plain;
        const outcome = yield* next;
        const ranges = yield* editedRanges(deps, params.value.file, params.value.newText);

        return [outcome, [{ path: params.value.file, ranges, edited: true }]] as const;
      }
      case "write": {
        const file = Option.flatMap(decodePath(call.params), ({ path }) => relativeOf(deps, path));
        if (Option.isNone(file)) return yield* plain;

        return [yield* next, [whole(file.value)]] as const;
      }
      case "shell":
      case "process_start": {
        const before = yield* snapshot(deps);
        const outcome = yield* next;
        const after = yield* snapshot(deps);

        return [outcome, changedPaths(before, after).map(whole)] as const;
      }
      default:
        return yield* plain;
    }
  });

/** The middleware: a done call that touched files leaves a hidden `memory/touched` entry. */
export const touchedWrapper =
  (deps: TouchedDeps) =>
  (allowed: AllowedCall, next: Effect.Effect<ToolOutcome>): Effect.Effect<ToolOutcome> =>
    Effect.gen(function* () {
      const [outcome, files] = yield* runAndTouch(deps, allowed, next);
      if (outcome.status !== "done" || files.length === 0) return outcome;

      yield* deps.log
        .append(allowed.call.sessionId, [
          draft(TouchedEntry, {
            data: { callId: allowed.call.callId, files },
            text: files.map((file) => file.path).join(", "),
          }),
        ])
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("memory could not record touched files", error),
          ),
        );

      return outcome;
    });
