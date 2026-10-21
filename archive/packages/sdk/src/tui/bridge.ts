/**
 * Runs Effect work for a UI part's Solid components: fire-and-forget commands, and streams read as
 * signals. Everything runs in the part's Scope, so unloading the part stops it.
 */

import { Cause, Effect, Fiber, FiberSet, Stream } from "effect";
import { type Accessor, createSignal, getOwner, onCleanup } from "solid-js";

export interface Bridge {
  /** Runs `effect` in the part's Scope; a failure is logged. */
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => void;
  /**
   * The latest value of `stream`, starting at `initial`. Inside a component it stops when the
   * component is disposed; otherwise when the part unloads.
   */
  readonly watch: <A, E>(stream: Stream.Stream<A, E>, initial: A) => Accessor<A>;
}

/** Logs a failure; an interrupt is the part or component closing, not a failure. */
const logged = <A, E>(effect: Effect.Effect<A, E>, message: string) =>
  Effect.tapCauseIf(
    effect,
    (cause) => !Cause.hasInterruptsOnly(cause),
    (cause) => Effect.logError(message, cause),
  );

/** A Bridge over the caller's Scope; make it in a part's `setup`. */
export const makeBridge = Effect.gen(function* () {
  const fork = yield* FiberSet.makeRuntime();

  const run = <A, E>(effect: Effect.Effect<A, E>) => {
    fork(logged(effect, "UI work failed"));
  };

  const watch = <A, E>(stream: Stream.Stream<A, E>, initial: A) => {
    const [value, setValue] = createSignal<A>(initial);

    const fiber = fork(
      logged(
        Stream.runForEach(stream, (next) => Effect.sync(() => setValue(() => next))),
        "UI stream failed",
      ),
    );

    if (getOwner() !== null) onCleanup(() => fork(Fiber.interrupt(fiber)));

    return value;
  };

  const bridge: Bridge = { run, watch };

  return bridge;
});
