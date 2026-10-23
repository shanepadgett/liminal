/**
 * Effect work from Solid components: commands run and forgotten, streams read as signals, and a
 * session's view as a store. Everything runs in the TUI's scope, and a component's work stops with
 * the component.
 */
import { Cause, Effect, Fiber, FiberSet, Stream, SubscriptionRef } from "effect";
import { type Accessor, createContext, createSignal, onCleanup, useContext } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { type Host, SessionView } from "@shanepadgett/liminal-client";
import type { SessionId } from "@shanepadgett/liminal-session/contract";

import type { Dialogs } from "./dialogs.tsx";
import type { Pickers } from "./pickers.tsx";

/** What component work may use. */
export type Services = Host | Dialogs | Pickers;

/** Forks `effect` into the TUI's scope. */
export type Fork = <A, E>(effect: Effect.Effect<A, E, Services>) => Fiber.Fiber<A, E>;

const ForkContext = createContext<Fork>();

export const ForkProvider = ForkContext.Provider;

const useFork = (): Fork => {
  const fork = useContext(ForkContext);
  if (fork === undefined) throw new Error("A TUI component ran outside the TUI's root.");

  return fork;
};

/** Logs a failure; an interrupt is the component or the TUI closing, not a failure. */
const logged = <A, E>(effect: Effect.Effect<A, E, Services>, message: string) =>
  Effect.tapCauseIf(
    effect,
    (cause) => !Cause.hasInterruptsOnly(cause),
    (cause) => Effect.logError(message, cause),
  );

/** Forks `effect` into the TUI's scope, interrupted when the calling component goes. */
const useForkOwned = () => {
  const fork = useFork();

  return <A, E>(effect: Effect.Effect<A, E, Services>, message: string) => {
    const fiber = fork(logged(effect, message));
    onCleanup(() => fork(Fiber.interrupt(fiber)));
  };
};

/** Runs an effect and forgets it; a failure is logged. */
export type EntryRun = <A, E>(effect: Effect.Effect<A, E, Services>) => void;

/**
 * For a `tui` entry's commands and callbacks: runs effects in the entry's scope and logs a failure
 * with `message`.
 */
export const makeEntryRun = Effect.fn("makeEntryRun")(function* (message: string) {
  const fork = yield* FiberSet.makeRuntime<Services>();

  const run: EntryRun = (effect) => {
    fork(logged(effect, message));
  };

  return run;
});

/** Runs effects from event handlers; a failure is logged. */
export const useRun = (): (<A, E>(effect: Effect.Effect<A, E, Services>) => void) => {
  const fork = useFork();

  return (effect) => {
    fork(logged(effect, "TUI work failed."));
  };
};

/** The latest value of `stream`, starting at `initial`; it stops with the component. */
export const useWatch = <A, E>(stream: Stream.Stream<A, E, Services>, initial: A): Accessor<A> => {
  const forkOwned = useForkOwned();
  const [value, setValue] = createSignal<A>(initial);
  const write = (next: A) => Effect.sync(() => setValue(() => next));
  forkOwned(Stream.runForEach(stream, write), "A TUI stream failed.");

  return value;
};

const EMPTY: SessionView.ViewState = { events: [], streaming: [], running: false, queued: [] };

/**
 * `session` as the view keeps it, as a Solid store whose events keep their identity by `seq`, so a
 * new event redraws only itself. It stops with the component.
 */
export const useSessionView = (session: SessionId) => {
  const forkOwned = useForkOwned();
  const run = useRun();
  const [state, setState] = createStore<SessionView.ViewState>(EMPTY);
  const [view, setView] = createSignal<SessionView.SessionView>();

  const write = (next: SessionView.ViewState) =>
    Effect.sync(() => {
      setState(reconcile(next, { key: "seq" }));
    });

  const follow = Effect.gen(function* () {
    const opened = yield* SessionView.open(session);
    setView(opened);
    yield* Stream.runForEach(SubscriptionRef.changes(opened.state), write);
  });

  forkOwned(Effect.scoped(follow), `The view of session ${session} failed.`);

  const loadOlder = () => {
    const opened = view();
    if (opened !== undefined) run(opened.loadOlder);
  };

  return { state, loadOlder };
};
