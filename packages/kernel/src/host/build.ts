/** Builds each active plugin concurrently in its own scope, once the plugins it needs are built. */

import { Cause, Context, Deferred, Effect, Exit, Layer, Option, Schema, Scope } from "effect";

import type { BaseServices } from "@liminal/sdk";

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
  return yield* Effect.tryPromise(plugin.server).pipe(
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
) {
  const scope = yield* Scope.fork(root);

  // definePlugin checks that the layer needs only its requires, uses and the base services, all in `context`.
  const exit = yield* Effect.exit(
    Effect.provideContext(Layer.buildWithScope(layer, scope), context),
  );

  if (Exit.isSuccess(exit)) return exit.value;

  yield* Scope.close(scope, exit);

  return yield* Effect.fail(InactiveReason.BuildFailed({ cause: exit.cause }));
});

const buildPlugin = Effect.fn("buildPlugin")(function* (
  plugin: Manifest,
  resolution: Resolution,
  waiting: Waiting,
) {
  const base = yield* Effect.context<BaseServices>();
  const root = yield* Effect.scope;
  const dependencies = yield* awaitDependencies(plugin, resolution.providers, waiting);
  const server = yield* importServer(plugin);

  return yield* buildInScope(server.layer, Context.merge(base, dependencies), root);
});

export interface BuildResult {
  readonly services: Built;
  readonly status: ReadonlyArray<PluginStatus>;
}

/** Builds every active plugin; a plugin waits on the Deferreds of the plugins it needs. */
export const build = Effect.fn("build")(function* (resolution: Resolution) {
  const waiting = new Map<string, Deferred.Deferred<Built, InactiveReason>>();

  for (const plugin of resolution.active)
    waiting.set(plugin.name, yield* Deferred.make<Built, InactiveReason>());

  const results = yield* Effect.forEach(
    resolution.active,
    (plugin) => {
      const deferred = waiting.get(plugin.name);

      return buildPlugin(plugin, resolution, waiting).pipe(
        Effect.exit,
        Effect.tap((exit) =>
          deferred === undefined ? Effect.void : Deferred.done(deferred, exit),
        ),
        Effect.map((exit) => ({ name: plugin.name, exit })),
      );
    },
    { concurrency: "unbounded" },
  );

  let services: Built = Context.empty();
  const status: Array<PluginStatus> = [];

  for (const { name, exit } of results) {
    if (Exit.isSuccess(exit)) {
      services = Context.merge(services, exit.value);
      status.push(PluginStatus.Active({ name }));
      continue;
    }

    const reason = Cause.findErrorOption(exit.cause);

    const inactive = Option.getOrElse(reason, () =>
      InactiveReason.BuildFailed({ cause: exit.cause }),
    );

    status.push(PluginStatus.Inactive({ name, reason: inactive }));
  }

  const result: BuildResult = { services, status };

  return result;
});
