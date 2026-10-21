/**
 * Which plugin builds a caller can see. A reload builds new plugins beside the running ones, and a
 * request on an older graph runs on while a newer graph is current; registries share one instance
 * across those graphs, so each registration carries its build and each caller sees only its
 * graph's.
 */

import { Context, Effect, Option, Stream, SubscriptionRef } from "effect";

/** The build whose layer is running, set by the kernel; none outside a kernel build, as in tests. */
export const RegisteringBuild = Context.Reference<Option.Option<number>>(
  "liminal/RegisteringBuild",
  { defaultValue: Option.none },
);

/**
 * The builds of the graph the caller holds, set by the kernel; none for a fiber that holds no
 * graph, such as one forked while a layer builds.
 */
export const HeldBuilds = Context.Reference<Option.Option<ReadonlySet<number>>>(
  "liminal/HeldBuilds",
  { defaultValue: Option.none },
);

/** A registration and the build that made it. */
interface Registered {
  readonly build: Option.Option<number>;
}

/** A registration with no build, or a caller that holds no graph, sees and is seen by every build. */
const isVisible = (build: Option.Option<number>, held: Option.Option<ReadonlySet<number>>) =>
  Option.isNone(build) || Option.isNone(held) || held.value.has(build.value);

const visibleTo =
  (held: Option.Option<ReadonlySet<number>>) =>
  <R extends Registered>(registrations: ReadonlyArray<R>) =>
    registrations.filter((registration) => isVisible(registration.build, held));

/**
 * Adds the registration `of` makes for the registering build, placed by `insert`; it is removed
 * when the caller's Scope closes.
 */
export const addRegistration = Effect.fn("addRegistration")(function* <R extends Registered>(
  ref: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>,
  of: (build: Option.Option<number>) => R,
  insert: (current: ReadonlyArray<R>, added: R) => ReadonlyArray<R>,
) {
  const registration = of(yield* RegisteringBuild);

  yield* Effect.acquireRelease(
    SubscriptionRef.update(ref, (current) => insert(current, registration)),
    () =>
      SubscriptionRef.update(ref, (current) => current.filter((entry) => entry !== registration)),
  );
});

/** The registrations in `ref` that the caller's graph can see, now and after each change. */
export const visibleIn = <R extends Registered>(
  ref: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>,
) => ({
  current: Effect.flatMap(HeldBuilds, (held) =>
    Effect.map(SubscriptionRef.get(ref), visibleTo(held)),
  ),
  // The graph is read once, when the stream starts, since its holder keeps one graph throughout.
  changes: Stream.unwrap(
    Effect.map(HeldBuilds, (held) =>
      SubscriptionRef.changes(ref).pipe(Stream.map(visibleTo(held))),
    ),
  ),
});
