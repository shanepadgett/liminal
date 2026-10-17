/** Work that outlives graph changes: each use reads the graph current when it starts. */

import { Context, Effect, FiberMap, Schema } from "effect";

/** The current graph has no active provider of `service`. */
export class ServiceMissing extends Schema.TaggedError<
  ServiceMissing,
  { readonly brand: unique symbol }
>()("ServiceMissing", { service: Schema.String }) {}

export class Work extends Context.Service<
  Work,
  {
    /**
     * Runs `f` with `tag`'s service from the graph current now; the graph stays open until `f`
     * ends.
     */
    readonly use: <I, S, A, E>(
      tag: Context.Key<I, S>,
      f: (service: S) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | ServiceMissing>;
    /**
     * Runs `task` until it ends, in the kernel's scope rather than the caller's, so rebuilding the
     * caller's plugin leaves it running; one task per key, and a key already running is left
     * alone.
     */
    readonly start: (key: string, task: Effect.Effect<void>) => Effect.Effect<void>;
    /** Interrupts the task under `key`, if any. */
    readonly stop: (key: string) => Effect.Effect<void>;
  }
>()("liminal/Work") {}

/** Runs `f` with the services of one graph, holding that graph until `f` ends. */
export type HoldGraph = <A, E>(
  f: (services: Context.Context<never>) => Effect.Effect<A, E>,
) => Effect.Effect<A, E>;

/** A Work over `hold`; its tasks run in the scope that makes it and stop when that scope closes. */
export const makeWork = Effect.fn("makeWork")(function* (hold: HoldGraph) {
  const tasks = yield* FiberMap.make<string>();

  return Work.of({
    use: (tag, f) =>
      hold((services) =>
        Context.getOption(services, tag).pipe(
          Effect.fromOption,
          Effect.mapError(() => new ServiceMissing({ service: tag.key })),
          Effect.flatMap(f),
        ),
      ),
    start: (key, task) =>
      FiberMap.run(tasks, key, task, { onlyIfMissing: true }).pipe(Effect.asVoid),
    stop: (key) => FiberMap.remove(tasks, key),
  });
});
