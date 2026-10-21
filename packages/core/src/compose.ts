/** Composes plugins into one Layer, each built in its own scope. */
import { Context, Effect, Layer, Scope } from "effect";

import { buildOrder } from "./build-order.ts";
import { BuildFailed, CompositionError } from "./composition-error.ts";
import type { AnyPlugin, Ids } from "./plugin.ts";

/** The services the plugins provide together. */
export type ProvidedBy<Plugins extends ReadonlyArray<AnyPlugin>> = Ids<Plugins[number]["provides"]>;

/**
 * The services built so far. A plugin's requirements exist only in its types, so `buildOrder`
 * stands in for the type check: it puts every provider of a plugin's `requires` before it.
 */
type Built = Context.Context<unknown>;

const buildFailed = (plugin: AnyPlugin, cause: unknown) =>
  new CompositionError({ reason: BuildFailed.make({ plugin: plugin.name, cause }) });

/** Builds `plugin` in a scope forked from `parent`, given the services built before it. */
const buildPlugin = Effect.fn("buildPlugin")(function* (
  plugin: AnyPlugin,
  parent: Scope.Scope,
  built: Built,
) {
  const scope = yield* Scope.fork(parent);

  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- a plugin's error and requirements are typed only where it is defined; the next lines settle both.
  const services = yield* Layer.buildWithScope(plugin.layer, scope).pipe(
    Effect.provideContext(built),
    Effect.mapError((error) => buildFailed(plugin, error)),
    Effect.catchDefect((defect) => Effect.fail(buildFailed(plugin, defect))),
  );

  return Context.merge(built, services);
});

const buildAll = Effect.fn("compose")(function* (plugins: ReadonlyArray<AnyPlugin>) {
  const ordered = yield* buildOrder(plugins);
  // A sequential scope closes its plugins' scopes in reverse build order, dependents first,
  // whatever strategy the caller's scope uses.
  const scope = yield* Scope.fork(yield* Effect.scope, "sequential");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see Built: the build order meets each plugin's requirements.
  const empty = Context.empty() as Built;

  return yield* Effect.reduce(
    ordered,
    () => empty,
    (built, plugin) => buildPlugin(plugin, scope, built),
  );
});

/**
 * Builds the plugins in dependency order and provides every service they provide. Fails with a
 * `CompositionError` at the first problem.
 */
export const compose = <const Plugins extends ReadonlyArray<AnyPlugin>>(
  plugins: Plugins,
): Layer.Layer<ProvidedBy<Plugins>, CompositionError> => Layer.effectContext(buildAll(plugins));
