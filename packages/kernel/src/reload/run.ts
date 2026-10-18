/**
 * Runs the reload machine on one fiber: classifies changed files, checks each change out of sight,
 * and applies the newest passed one once no turn runs, by swapping the graph or asking for a
 * restart.
 */

import {
  Deferred,
  Effect,
  Exit,
  FiberHandle,
  Inspectable,
  Option,
  Path,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from "effect";
import { type ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  type HoldGraph,
  ReloadApplying,
  ReloadChecking,
  ReloadCurrent,
  ReloadFailed,
  ReloadReady,
  type ReloadState,
} from "@liminal/sdk";

import type { ChangeFailed } from "../graph/change.ts";
import type { Candidate, Graphs } from "../graph/graphs.ts";
import { Change, classify } from "./changes.ts";
import { Command, Event, initialState, Phase, type State, transition } from "./machine.ts";

/** Whether checked code applies on its own, or waits for the reload command. */
export type ReloadMode = "automatic" | "confirmed";

/** How the kernel learns of changed code and checks it; absent, the plugin set is locked. */
export interface ReloadOptions {
  /** Absolute paths of changed files, in batches. */
  readonly changes: Stream.Stream<ReadonlyArray<string>>;
  /** Folders of code loaded at start; a change there needs a new process. */
  readonly restartRoots: ReadonlyArray<string>;
  /** Run before any other check; a non-zero exit fails the change. */
  readonly typecheck: Option.Option<ChildProcess.Command>;
  /** Starts the changed app without a frontend; a non-zero exit fails a restart. */
  readonly startCheck: ChildProcess.Command;
  /** Read when a check passes, so a settings change applies to the next one. */
  readonly mode: (use: HoldGraph) => Effect.Effect<ReloadMode>;
}

/** The kernel's reload controls. */
export interface Reloads {
  /** The reload state, then each change. */
  readonly state: Stream.Stream<ReloadState>;
  /** The reload command: applies checked code once no turn runs; does nothing unless ready. */
  readonly request: Effect.Effect<void>;
  /** Completes once a restart applies; the app then exits for a new process. */
  readonly restartDue: Effect.Effect<void>;
}

/** A locked plugin set: never changes, never restarts. */
export const lockedReloads: Reloads = {
  state: Stream.make(ReloadCurrent.make({})),
  request: Effect.void,
  restartDue: Effect.never,
};

/** A check that did not pass, with what to show for it. */
class CheckFailed extends Schema.TaggedError<CheckFailed, { readonly brand: unique symbol }>()(
  "CheckFailed",
  { reason: Schema.String },
) {}

/** The last lines of a command's output, enough to see why it failed. */
const tail = (output: string) => output.trimEnd().split("\n").slice(-20).join("\n");

/** Runs `command` to its end; a non-zero exit fails with its output. */
const runCommand = (command: ChildProcess.Command) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(command);

    return yield* Effect.all(
      [handle.all.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
      { concurrency: "unbounded" },
    );
  }).pipe(
    Effect.scoped,
    Effect.mapError((error) => new CheckFailed({ reason: error.message })),
    Effect.flatMap(([output, code]) =>
      code === 0
        ? Effect.void
        : Effect.fail(new CheckFailed({ reason: tail(output) || `Exited with code ${code}.` })),
    ),
  );

const describeChange = (error: ChangeFailed) =>
  error.failed.map(({ name, reason }) => `${name}: ${reason}`).join("\n");

/** What the runner's steps share. */
interface Runner {
  readonly options: ReloadOptions;
  readonly graphs: Graphs;
  readonly close: <A, E>(apply: Effect.Effect<A, E>) => Effect.Effect<A, E>;
  readonly events: Queue.Queue<Event>;
  readonly checks: FiberHandle.FiberHandle<void, never>;
  readonly restartDue: Deferred.Deferred<void>;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
}

const offer = (runner: Runner, event: Event) => Queue.offer(runner.events, event);

/** Reports a pass, read against the mode at this moment. */
const passed = (runner: Runner, check: number, candidate: Option.Option<Candidate>) =>
  runner.options
    .mode(runner.graphs.hold)
    .pipe(
      Effect.flatMap((mode) =>
        offer(runner, Event.Passed({ check, candidate, isAutomatic: mode === "automatic" })),
      ),
    );

const failed = (runner: Runner, check: number) => (error: CheckFailed) =>
  offer(runner, Event.CheckFailed({ check, reason: error.reason }));

/**
 * Builds a plugin change's candidate. Once building starts it finishes and is reported, so a newer
 * check never leaves a candidate no one discards.
 */
const preparePlugins = (runner: Runner, check: number, packages: ReadonlySet<string>) =>
  runner.graphs.prepare(packages).pipe(
    Effect.mapError((error) => new CheckFailed({ reason: describeChange(error) })),
    Effect.matchEffect({
      onFailure: failed(runner, check),
      onSuccess: (candidate) => passed(runner, check, Option.some(candidate)),
    }),
    Effect.uninterruptible,
  );

const startCheck = (runner: Runner, check: number) =>
  runCommand(runner.options.startCheck).pipe(
    Effect.matchEffect({
      onFailure: failed(runner, check),
      onSuccess: () => passed(runner, check, Option.none()),
    }),
  );

/** Typechecks, then start-checks a restart or builds a plugin change aside. */
const runCheck = (runner: Runner, change: Change, check: number) => {
  const typecheck = Option.match(runner.options.typecheck, {
    onNone: () => Effect.void,
    onSome: runCommand,
  });

  const next = Change.$match(change, {
    Restart: () => startCheck(runner, check),
    Plugins: ({ packages }) => preparePlugins(runner, check, packages),
  });

  return typecheck.pipe(
    Effect.matchEffect({ onFailure: failed(runner, check), onSuccess: () => next }),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, runner.spawner),
    Effect.catchDefect((defect) =>
      offer(runner, Event.CheckFailed({ check, reason: Inspectable.toStringUnknown(defect) })),
    ),
  );
};

/**
 * Applies once no turn runs. A plugin change commits its candidate and reopens the gate; a restart
 * keeps the gate closed until the process exits.
 */
const apply = (runner: Runner, candidate: Option.Option<Candidate>) =>
  Option.match(candidate, {
    onSome: (ready) =>
      runner
        .close(runner.graphs.commit(ready))
        .pipe(Effect.andThen(offer(runner, Event.Applied()))),
    onNone: () =>
      runner.close(Deferred.done(runner.restartDue, Exit.void).pipe(Effect.andThen(Effect.never))),
  });

const execute = (runner: Runner, command: Command) =>
  Command.$match(command, {
    Check: ({ change, check }) =>
      FiberHandle.run(runner.checks, runCheck(runner, change, check)).pipe(Effect.asVoid),
    Discard: ({ candidate }) => runner.graphs.discard(candidate),
    Apply: ({ candidate }) => Effect.forkScoped(apply(runner, candidate)).pipe(Effect.asVoid),
  });

const toReloadState: (phase: Phase) => ReloadState = Phase.$match({
  Current: () => ReloadCurrent.make({}),
  Checking: () => ReloadChecking.make({}),
  Ready: ({ change }) => ReloadReady.make({ restart: Change.$is("Restart")(change) }),
  Failed: ({ reason }) => ReloadFailed.make({ reason }),
  Applying: () => ReloadApplying.make({}),
});

/** Feeds each batch of changed files that touches watched code to the machine as one change. */
const watch = Effect.fn("watch")(function* (runner: Runner, folders: ReadonlyArray<string>) {
  const path = yield* Path.Path;
  const watched = { folders, restartRoots: runner.options.restartRoots };

  yield* runner.options.changes.pipe(
    Stream.runForEach((files) => {
      const change = classify(path, watched, files);

      return change === undefined ? Effect.void : offer(runner, Event.Changed({ change }));
    }),
  );
});

/** Starts the reload machine for `graphs` until the scope closes. */
export const runReloads = Effect.fn("runReloads")(function* (
  options: ReloadOptions,
  context: {
    readonly graphs: Graphs;
    readonly folders: ReadonlyArray<string>;
    readonly close: Runner["close"];
  },
) {
  const runner: Runner = {
    options,
    graphs: context.graphs,
    close: context.close,
    events: yield* Queue.unbounded<Event>(),
    checks: yield* FiberHandle.make<void, never>(),
    restartDue: yield* Deferred.make<void>(),
    spawner: yield* ChildProcessSpawner.ChildProcessSpawner,
  };

  const published = yield* SubscriptionRef.make<ReloadState>(ReloadCurrent.make({}));
  let state: State = initialState;

  const step = Effect.fn("step")(function* (event: Event) {
    const [next, commands] = transition(state, event);
    const isMoved = next.phase !== state.phase;
    state = next;
    if (isMoved) yield* SubscriptionRef.set(published, toReloadState(next.phase));
    yield* Effect.forEach(commands, (command) => execute(runner, command), { discard: true });
  });

  yield* Queue.take(runner.events).pipe(Effect.flatMap(step), Effect.forever, Effect.forkScoped);
  yield* Effect.forkScoped(watch(runner, context.folders));

  const reloads: Reloads = {
    state: SubscriptionRef.changes(published),
    request: offer(runner, Event.Requested()).pipe(Effect.asVoid),
    restartDue: Deferred.await(runner.restartDue),
  };

  return reloads;
});
