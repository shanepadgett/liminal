/** Builds each active plugin concurrently in its own scope, once the plugins it needs are built. */

import { Cause, Context, Deferred, Effect, Exit, Layer, Option, Schema, Scope } from "effect";
import type { RpcGroup } from "effect/rpc";

import { type BaseServices, type PartModule, RegisteringBuild } from "@liminal/sdk";

import { type Manifest, ServerModule, type ServerLayer } from "./manifest.ts";
import type { Resolution } from "./resolve.ts";
import { InactiveReason, PluginStatus } from "./status.ts";

/** A plugin's services; `never` since the host never reads them by type. */
type Built = Context.Context<never>;

type Waiting = ReadonlyMap<string, Deferred.Deferred<Built, InactiveReason>>;

/**
 * Waits for every required provider, and for each optional one that is active; a failed one is
 * skipped.
 */
const awaitDependencies = Effect.fn("awaitDependencies")(function* (
  plugin: Manifest,
  providers: ReadonlyMap<string, string>,
  waiting: Waiting,
) {
  const deferredOf = (key: string) => waiting.get(providers.get(key) ?? "");
  let context: Built = Context.empty();

  for (const tag of plugin.requires) {
    const deferred = deferredOf(tag.key);

    if (deferred === undefined)
      return yield* Effect.fail(InactiveReason.MissingService({ service: tag.key }));

    const built = yield* Deferred.await(deferred).pipe(
      Effect.mapError(() =>
        InactiveReason.DependencyInactive({ plugin: providers.get(tag.key) ?? "" }),
      ),
    );

    context = Context.merge(context, built);
  }

  for (const tag of plugin.uses) {
    const deferred = deferredOf(tag.key);
    if (deferred === undefined) continue;

    const built = yield* Effect.option(Deferred.await(deferred));
    if (Option.isSome(built)) context = Context.merge(context, built.value);
  }

  return context;
});

const importServer = Effect.fn("importServer")(function* (plugin: Manifest) {
  const load = plugin.server;
  // A plugin with no server provides nothing, so it builds to no services.
  if (load === undefined) return { layer: Layer.empty };

  return yield* Effect.tryPromise(load).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ServerModule)),
    Effect.catchCause((cause) => Effect.fail(InactiveReason.ImportFailed({ cause }))),
  );
});

/**
 * Builds the layer in a child of `root`; on failure the child closes and its resources are
 * released.
 */
const buildInScope = Effect.fn("buildInScope")(function* (
  layer: ServerLayer,
  context: Context.Context<BaseServices>,
  root: Scope.Scope,
  id: number,
) {
  const scope = yield* Scope.fork(root);

  // definePlugin checks that the layer needs only its requires and the base services, all in `context`;
  // the uses found are in `context` too, for `Effect.serviceOption`.
  const exit = yield* Effect.exit(
    Layer.buildWithScope(layer, scope).pipe(
      Effect.provideContext(Context.add(context, RegisteringBuild, Option.some(id))),
    ),
  );

  if (Exit.isSuccess(exit)) return { services: exit.value, scope };

  yield* Scope.close(scope, exit);

  return yield* Effect.fail(InactiveReason.BuildFailed({ cause: exit.cause }));
});

/** A frontend part of a manifest the kernel imports at build, such as the TUI's. */
export type PartName = "tui";

/** A build's imported frontend parts, by name; each module is checked by the frontend. */
export type Parts = { readonly [Name in PartName]?: PartModule };

/** One plugin's built services and the scope that holds them; graphs may share it. */
export interface PluginBuild {
  /** Unique per build across the kernel's life; a kept build keeps its number. */
  readonly id: number;
  readonly manifest: Manifest;
  readonly services: Built;
  readonly scope: Scope.Closeable;
  /** Imported with the server, so a frontend uses only code the build checked. */
  readonly parts: Parts;
}

export interface BuildOptions {
  /** Builds kept from an earlier graph, by plugin name; their plugins are not built again. */
  readonly reuse: ReadonlyMap<string, PluginBuild>;
  /** Each new build's scope is a child of this one. */
  readonly root: Scope.Scope;
  /** Numbers each new build. */
  readonly nextId: Effect.Effect<number>;
  /** The frontend parts to import with each new build. */
  readonly parts: ReadonlyArray<PartName>;
}

/** Imports each named part the manifest has; a part that fails to import fails the build. */
const importParts = Effect.fn("importParts")(function* (
  plugin: Manifest,
  names: ReadonlyArray<PartName>,
) {
  const parts: { [Name in PartName]?: PartModule } = {};

  for (const name of names) {
    const load = plugin[name];
    if (load === undefined) continue;

    parts[name] = yield* Effect.tryPromise(load).pipe(
      Effect.catchCause((cause) => Effect.fail(InactiveReason.ImportFailed({ cause }))),
    );
  }

  return parts;
});

const buildPlugin = Effect.fn("buildPlugin")(function* (
  plugin: Manifest,
  resolution: Resolution,
  waiting: Waiting,
  options: BuildOptions,
) {
  const dependencies = yield* awaitDependencies(plugin, resolution.providers, waiting);
  const kept = options.reuse.get(plugin.name);
  if (kept !== undefined) return kept;

  const base = yield* Effect.context<BaseServices>();
  const server = yield* importServer(plugin);
  const parts = yield* importParts(plugin, options.parts);

  // Numbered first, so its registrations carry the number while the layer builds.
  const id = yield* options.nextId;
  const context = Context.merge(base, dependencies);
  const built = yield* buildInScope(server.layer, context, options.root, id);

  const build: PluginBuild = { id, manifest: plugin, parts, ...built };

  return build;
});

export interface BuildResult {
  /** Every active plugin's build, kept ones included, each after the plugins it needs. */
  readonly builds: ReadonlyArray<PluginBuild>;
  readonly services: Built;
  readonly status: ReadonlyArray<PluginStatus>;
  /** The active plugins' commands, handled by `services`. */
  readonly rpcs: ReadonlyArray<RpcGroup.Any>;
}

/** Builds every active plugin; a plugin waits on the Deferreds of the plugins it needs. */
export const build = Effect.fn("build")(function* (resolution: Resolution, options: BuildOptions) {
  const waiting = new Map<string, Deferred.Deferred<Built, InactiveReason>>();

  const builds: Array<PluginBuild> = [];

  for (const plugin of resolution.active)
    waiting.set(plugin.name, yield* Deferred.make<Built, InactiveReason>());

  const results = yield* Effect.forEach(
    resolution.active,
    (plugin) => {
      const deferred = waiting.get(plugin.name);

      return buildPlugin(plugin, resolution, waiting, options).pipe(
        Effect.tap((built) => Effect.sync(() => builds.push(built))),
        Effect.exit,
        Effect.tap((exit) =>
          deferred === undefined
            ? Effect.void
            : Deferred.done(
                deferred,
                Exit.map(exit, (built) => built.services),
              ),
        ),
        Effect.map((exit) => ({ plugin, exit })),
      );
    },
    { concurrency: "unbounded" },
  );

  let services: Built = Context.empty();
  const status: Array<PluginStatus> = [];
  const rpcs: Array<RpcGroup.Any> = [];

  for (const { plugin, exit } of results) {
    const { name } = plugin;

    if (Exit.isSuccess(exit)) {
      services = Context.merge(services, exit.value.services);
      status.push(PluginStatus.Active({ name }));
      if (plugin.rpcs !== undefined) rpcs.push(plugin.rpcs);
      continue;
    }

    const reason = Cause.findErrorOption(exit.cause);

    const inactive = Option.getOrElse(reason, () =>
      InactiveReason.BuildFailed({ cause: exit.cause }),
    );

    status.push(PluginStatus.Inactive({ name, reason: inactive }));
  }

  const result: BuildResult = { builds, services, status, rpcs };

  return result;
});
