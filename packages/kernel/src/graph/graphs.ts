/**
 * The kernel's graphs, held by reference count: the current one, and each older one until its last
 * holder ends. A graph change builds the changed plugins and their dependents aside and keeps the
 * rest of the current graph's builds.
 */

import { Context, Deferred, Effect, Exit, Scope, Semaphore, SubscriptionRef } from "effect";
import type { RpcGroup } from "effect/rpc";

import { type BaseServices, type HoldGraph, makeWork, Work } from "@liminal/sdk";

import { build, type PluginBuild } from "../host/build.ts";
import { load } from "../host/host.ts";
import type { PluginStatus } from "../host/status.ts";
import { ChangeFailed, keptBuilds, newlyFailing } from "./change.ts";

export interface Graph {
  readonly status: ReadonlyArray<PluginStatus>;
  readonly services: Context.Context<never>;
  readonly rpcs: ReadonlyArray<RpcGroup.Any>;
  /** Each after the plugins it needs. */
  readonly builds: ReadonlyArray<PluginBuild>;
  /** The provider of each service key. */
  readonly providers: ReadonlyMap<string, string>;
  /** What runs for the graph itself, such as its protocol server; closes with the graph. */
  readonly scope: Scope.Closeable;
  /** Done once the graph has closed. */
  readonly closed: Deferred.Deferred<void>;
}

/** Shared counts: a graph is closed at 0 holders, a build at 0 graphs. */
const makeCounts = (root: Scope.Scope) => {
  const holders = new Map<Graph, number>();
  const users = new Map<PluginBuild, number>();

  const releaseBuild = (kept: PluginBuild) =>
    Effect.suspend(() => {
      const left = (users.get(kept) ?? 0) - 1;

      if (left > 0) {
        return Effect.sync(() => {
          users.set(kept, left);
        });
      }

      users.delete(kept);

      return Scope.close(kept.scope, Exit.void);
    });

  const open = Effect.fn("open")(function* (graph: Omit<Graph, "scope" | "closed">) {
    const opened: Graph = {
      ...graph,
      scope: yield* Scope.fork(root),
      closed: yield* Deferred.make<void>(),
    };

    for (const kept of graph.builds) users.set(kept, (users.get(kept) ?? 0) + 1);
    holders.set(opened, 1);

    return opened;
  });

  const retain = (graph: Graph) => holders.set(graph, (holders.get(graph) ?? 0) + 1);

  /** Closes the graph's own scope, then its builds, dependents first. */
  const release = (graph: Graph) =>
    Effect.suspend(() => {
      const left = (holders.get(graph) ?? 0) - 1;

      if (left > 0) {
        return Effect.sync(() => {
          holders.set(graph, left);
        });
      }

      holders.delete(graph);

      return Scope.close(graph.scope, Exit.void).pipe(
        Effect.andThen(Effect.forEach(graph.builds.toReversed(), releaseBuild, { discard: true })),
        Effect.andThen(Deferred.done(graph.closed, Exit.void)),
      );
    });

  return { open, retain, release };
};

/** Closes builds made for a change that failed; none of them is shared yet. */
const discard = (builds: ReadonlyArray<PluginBuild>) =>
  Effect.forEach(builds.toReversed(), (made) => Scope.close(made.scope, Exit.void), {
    discard: true,
  });

/** The graphs of the plugins in `folders`; the first is built before this returns. */
export const makeGraphs = Effect.fn("makeGraphs")(function* (folders: ReadonlyArray<string>) {
  // Builds live in a scope made before the work tasks, so closing the kernel stops tasks first.
  const root = yield* Scope.fork(yield* Effect.scope);
  const counts = makeCounts(root);
  const first = yield* Deferred.make<Graph>();
  const lock = yield* Semaphore.make(1);
  let current: Graph | undefined;

  /** Waits for the first graph, so work started while it builds runs once it is current. */
  const acquire = Effect.flatMap(Deferred.await(first), (initial) =>
    Effect.sync(() => {
      const graph = current ?? initial;
      counts.retain(graph);

      return graph;
    }),
  );

  const hold: HoldGraph = (f) =>
    Effect.acquireUseRelease(acquire, (graph) => f(graph.services), counts.release);

  const work = yield* makeWork(hold);

  const make = Effect.fn("make")(function* (
    previous: Graph | undefined,
    names: ReadonlySet<string>,
  ) {
    const loaded = yield* load(folders);

    const reuse =
      previous === undefined ? new Map() : keptBuilds(previous, loaded.resolution, names);

    const built = yield* build(loaded.resolution, { reuse, root }).pipe(
      Effect.provideService(Work, work),
    );

    const status = [...loaded.inactive, ...built.status];
    const failed = previous === undefined ? [] : newlyFailing(previous.status, status);

    if (failed.length > 0) {
      yield* discard(built.builds.filter((made) => !reuse.has(made.manifest.name)));

      return yield* new ChangeFailed({ failed });
    }

    return yield* counts.open({ ...built, status, providers: loaded.resolution.providers });
  });

  const initial = yield* make(undefined, new Set()).pipe(Effect.orDie);
  current = initial;
  yield* Deferred.succeed(first, initial);
  const changes = yield* SubscriptionRef.make(initial);
  const platform = yield* Effect.context<Exclude<BaseServices, Work>>();

  /** Rebuilds `names` and their dependents, plus plugins whose resolution changed, then swaps. */
  const reload = (names: ReadonlyArray<string>) =>
    lock.withPermit(
      Effect.gen(function* () {
        const previous = current ?? initial;
        const next = yield* make(previous, new Set(names)).pipe(Effect.provideContext(platform));
        current = next;
        yield* SubscriptionRef.set(changes, next);
        yield* counts.release(previous);

        return next.status;
      }),
    );

  return {
    hold,
    work,
    acquire,
    release: counts.release,
    /** The current graph, then each one that replaces it. */
    changes: SubscriptionRef.changes(changes),
    reload,
  };
});

export type Graphs = Effect.Success<ReturnType<typeof makeGraphs>>;
