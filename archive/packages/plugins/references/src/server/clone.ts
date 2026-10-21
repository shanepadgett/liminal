/** Runs `git clone` and reports its progress lines. */

import { Duration, Effect, Option, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { CloneProgress, ReferenceFailed } from "../contract.ts";
import { errorLine } from "./git.ts";

/** A clone that prints nothing for this long is stopped. */
const STALL = Duration.minutes(3);

/** How long git may take to exit once its output ends. */
const EXIT_WAIT = Duration.seconds(2);

const PROGRESS_LINE =
  /(?<phase>Receiving objects|Resolving deltas|Updating files):\s+(?<percent>\d+)%/;

const PHASES: Readonly<Record<string, CloneProgress["phase"]>> = {
  "Receiving objects": "receiving",
  "Resolving deltas": "resolving",
  "Updating files": "updating",
};

/** The progress a line of git's output reports, if any. */
export const progressOf = (line: string): Option.Option<CloneProgress> => {
  const groups = PROGRESS_LINE.exec(line)?.groups;

  return Option.map(Option.fromUndefinedOr(PHASES[groups?.["phase"] ?? ""]), (phase) =>
    CloneProgress.make({ phase, percent: Number(groups?.["percent"]) }),
  );
};

/** Where a clone goes: `url` into `path`, run from `folder`. */
export interface CloneTarget {
  readonly folder: string;
  readonly url: string;
  readonly path: string;
}

/**
 * Clones into `target.path`, giving each progress step to `progress`. Git writes its progress to
 * stderr only, as carriage-return separated lines.
 */
export const cloneInto = Effect.fn("references.cloneInto")(function* (
  reference: string,
  target: CloneTarget,
  progress: (step: CloneProgress) => Effect.Effect<unknown>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const failed = (message: string) => new ReferenceFailed({ reference, message });

  const child = yield* spawner
    .spawn(
      ChildProcess.make(
        "git",
        ["clone", "--progress", "--single-branch", target.url, target.path],
        { cwd: target.folder, stdin: "ignore", stdout: "ignore", killSignal: "SIGKILL" },
      ),
    )
    .pipe(Effect.mapError((cause) => failed(cause.message)));

  const lines: Array<string> = [];

  yield* child.stderr.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.flatMap((line) => Stream.fromIterable(line.split("\r"))),
    Stream.timeout(STALL),
    Stream.runForEach((line) => {
      lines.push(line);

      return Option.match(progressOf(line), { onNone: () => Effect.void, onSome: progress });
    }),
    Effect.mapError((cause) => failed(cause.message)),
  );

  const exitCode = yield* child.exitCode.pipe(
    Effect.timeoutOption(EXIT_WAIT),
    Effect.mapError((cause) => failed(cause.message)),
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(failed("The clone stalled with no output for 3 minutes.")),
        onSome: Effect.succeed,
      }),
    ),
  );

  return yield* exitCode === 0 ? Effect.void : Effect.fail(failed(errorLine(lines.join("\n"))));
}, Effect.scoped);
