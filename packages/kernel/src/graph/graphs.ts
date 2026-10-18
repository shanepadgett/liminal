/**
 * The kernel's graphs, held by reference count: the current one, and each older one until its last
 * holder ends. A graph change loads the changed packages fresh, builds their plugins and dependents
 * aside as a candidate, and keeps the rest of the current graph's builds; committing the candidate
 * makes it current.
 */

import { Context, Deferred, Effect, Exit, Scope, Semaphore, SubscriptionRef } from "effect";
import type { RpcGroup } from "effect/rpc";

import {
  type BaseServices,
  type CompositionInvalid,
  type GraphMember,
  type HoldGraph,
  makeWork,
  Work,
} from "@liminal/sdk";

import { build, type PartName, type PluginBuild } from "../host/build.ts";
import { type Composition, load } from "../host/host.ts";
import type { PluginPackage } from "../host/packages.ts";
import type { PluginStatus } from "../host/status.ts";
import { ChangeFailed, keptBuilds, newlyFailing, packagesToLoad, pluginsOf } from "./change.ts";

export interface Graph {
  readonly status: ReadonlyArray<PluginStatus>;
  readonly services: Context.Context<never>;
  readonly rpcs: ReadonlyArray<RpcGroup.Any>;
  /** Each after the plugins it needs. */
  readonly builds: ReadonlyArray<PluginBuild>;
  /** The provider of each service key. */
  readonly providers: ReadonlyMap<string, string>;
  /** Every package the graph's plugins were found in. */
  readonly packages: ReadonlyArray<PluginPackage>;
  /** What runs for the graph itself, such as its protocol server; closes with the graph. */
  readonly scope: Scope.Closeable;
  /** Done once the graph has closed. */
  readonly closed: Deferred.Deferred<void>;
}

type Unopened = Omit<Graph, "scope" | "closed">;

/** A graph built aside for a change; it applies only while `base` is still current. */
export interface Candidate {
  readonly graph: Unopened;
  readonly base: Graph;
  /** The builds and package loads the change made, closed if the candidate is discarded. */
  readonly fresh: {
    readonly builds: ReadonlyArray<PluginBuild>;
    readonly packages: ReadonlyArray<PluginPackage>;
  };
}

/** The graph's active plugins, each with its build number and imported parts. */
export const membersOf = (graph: Graph): ReadonlyArray<GraphMember> =>
  graph.builds.map((built) => ({ name: built.manifest.name, build: built.id, parts: built.parts }));

/** Counts the users of each item; the last release closes it. */
const makeCounted = <T>(close: (item: T) => Effect.Effect<void>) => {
  const users = new Map<T, number>();

  const retain = (item: T) => users.set(item, (users.get(item) ?? 0) + 1);

  const release = (item: T) =>
    Effect.suspend(() => {
      const left = (users.get(item) ?? 0) - 1;

      if (left > 0) {
        return Effect.sync(() => {
          users.set(item, left);
        });
      }

      users.delete(item);

      return close(item);
    });

  return { retain, release };
};

const closeBuild = (made: PluginBuild) => Scope.close(made.scope, Exit.void);

/**
 * Shared counts: a graph is closed at 0 holders, a build and a package load at 0 graphs. A graph
 * closes its own scope, then its builds, dependents first, then its packages.
 */
const makeCounts = (root: Scope.Scope) => {
  const builds = makeCounted(closeBuild);
  const packages = makeCounted((loaded: PluginPackage) => loaded.dispose);

  const holders = makeCounted((graph: Graph) =>
    Scope.close(graph.scope, Exit.void).pipe(
      Effect.andThen(Effect.forEach(graph.builds.toReversed(), builds.release, { discard: true })),
      Effect.andThen(Effect.forEach(graph.packages, packages.release, { discard: true })),
      Effect.andThen(Deferred.done(graph.closed, Exit.void)),
    ),
  );

  const open = Effect.fn("open")(function* (graph: Unopened) {
    const opened: Graph = {
      ...graph,
      scope: yield* Scope.fork(root),
      closed: yield* Deferred.make<void>(),
    };

    for (const kept of graph.builds) builds.retain(kept);
    for (const loaded of graph.packages) packages.retain(loaded);
    holders.retain(opened);

    return opened;
  });

  return { open, retain: holders.retain, release: holders.release };
};

/** Counts up from 1, one per run. */
const makeCounter = () => {
  let last = 0;

  return Effect.sync(() => ++last);
};

/** Closes what a candidate made; none of it is shared yet. */
const discardFresh = (fresh: Candidate["fresh"]) =>
  Effect.forEach(fresh.builds.toReversed(), closeBuild, { discard: true }).pipe(
    Effect.andThen(Effect.forEach(fresh.packages, (loaded) => loaded.dispose, { discard: true })),
  );

export interface GraphOptions {
  /** Read for every graph, so each change picks up the user's latest choices. */
  readonly composition: Effect.Effect<Composition, CompositionInvalid>;
  /** The frontend parts each build imports. */
  readonly parts: ReadonlyArray<PartName>;
}

interface Builder {
  readonly options: GraphOptions;
  readonly root: Scope.Scope;
  readonly nextId: Effect.Effect<number>;
  readonly work: Work["Service"];
}

/** Builds the graph for `base`'s change to `changed`, or the first graph with no base. */
const makeCandidate = Effect.fn("makeCandidate")(function* (
  builder: Builder,
  base: Graph | undefined,
  changed: ReadonlySet<string>,
) {
  const toLoad = base === undefined ? new Set<string>() : packagesToLoad(base, changed);
  const kept = new Map(base?.packages.map((loaded) => [loaded.dir, loaded]));

  const composition = yield* builder.options.composition;

  const loaded = yield* load(composition, (dir) => (toLoad.has(dir) ? undefined : kept.get(dir)));

  const freshPackages = loaded.packages.filter((one) => !base?.packages.includes(one));
  const names = new Set(freshPackages.flatMap(pluginsOf));
  const reuse = base === undefined ? new Map() : keptBuilds(base, loaded.resolution, names);
  const { root, nextId, work, options } = builder;

  const built = yield* build(loaded.resolution, { reuse, root, nextId, parts: options.parts }).pipe(
    Effect.provideService(Work, work),
  );

  const status = [...loaded.inactive, ...built.status];

  const fresh = {
    builds: built.builds.filter((made) => !base?.builds.includes(made)),
    packages: freshPackages,
  };

  const failed = base === undefined ? [] : newlyFailing(base.status, status);

  if (failed.length > 0) {
    yield* discardFresh(fresh);

    return yield* new ChangeFailed({ failed });
  }

  const graph: Unopened = {
    ...built,
    status,
    providers: loaded.resolution.providers,
    packages: loaded.packages,
  };

  return { graph, fresh };
});

/** The graphs of the composition's plugins; the first is built before this returns. */
export const makeGraphs = Effect.fn("makeGraphs")(function* (options: GraphOptions) {
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
  const builder: Builder = { options, root, nextId: makeCounter(), work };

  const made = yield* makeCandidate(builder, undefined, new Set()).pipe(
    Effect.catchTag("ChangeFailed", (error) => Effect.die(error)),
  );

  const initial = yield* counts.open(made.graph);
  current = initial;
  yield* Deferred.succeed(first, initial);
  const changes = yield* SubscriptionRef.make(initial);
  const platform = yield* Effect.context<Exclude<BaseServices, Work>>();
  const currentGraph = () => current ?? initial;

  /**
   * Reads the composition again, loads `changed` package folders fresh and builds the new graph
   * aside.
   */
  const prepare = (changed: ReadonlySet<string>) =>
    lock.withPermit(
      Effect.gen(function* () {
        const base = currentGraph();
        const candidate = yield* makeCandidate(builder, base, changed);

        return { ...candidate, base } satisfies Candidate;
      }).pipe(Effect.provideContext(platform)),
    );

  /** Makes the candidate current; work already running finishes on the graph it holds. */
  const commit = (candidate: Candidate) =>
    lock.withPermit(
      Effect.gen(function* () {
        const previous = currentGraph();

        if (candidate.base !== previous)
          return yield* Effect.die("A stale candidate was committed.");

        const next = yield* counts.open(candidate.graph);
        current = next;
        // Released first, so a graph left by every holder has closed when followers see its successor.
        yield* counts.release(previous);

        return yield* SubscriptionRef.set(changes, next);
      }),
    );

  return {
    hold,
    work,
    acquire,
    release: counts.release,
    /** The current graph, then each one that replaces it. */
    changes: SubscriptionRef.changes(changes),
    prepare,
    commit,
    /** Closes a candidate that will not be committed. */
    discard: (candidate: Candidate) => discardFresh(candidate.fresh),
  };
});

export type Graphs = Effect.Success<ReturnType<typeof makeGraphs>>;
