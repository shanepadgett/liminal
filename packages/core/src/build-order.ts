/**
 * The order plugins build in: each after the plugins it requires. A depth-first walk in list order
 * rather than `Graph.topo`, so ties keep list order and a cycle reports its path. Builds nothing.
 */
import { Effect } from "effect";

import {
  CompositionError,
  Cycle,
  DuplicateProvider,
  MissingProvider,
} from "./composition-error.ts";
import type { AnyPlugin } from "./plugin.ts";

type Providers = ReadonlyMap<string, AnyPlugin>;

const indexProviders = Effect.fn("indexProviders")(function* (plugins: ReadonlyArray<AnyPlugin>) {
  const providers = new Map<string, AnyPlugin>();

  for (const plugin of plugins) {
    for (const service of plugin.provides) {
      const existing = providers.get(service.key);

      if (existing !== undefined) {
        return yield* new CompositionError({
          reason: DuplicateProvider.make({
            service: service.key,
            plugins: [existing.name, plugin.name],
          }),
        });
      }

      providers.set(service.key, plugin);
    }
  }

  return providers;
});

/** The providers of everything `plugin` requires, in the order it lists them. */
const providersOf = Effect.fn("providersOf")(function* (plugin: AnyPlugin, providers: Providers) {
  const found: Array<AnyPlugin> = [];

  for (const service of plugin.requires) {
    const provider = providers.get(service.key);

    if (provider === undefined) {
      return yield* new CompositionError({
        reason: MissingProvider.make({ plugin: plugin.name, service: service.key }),
      });
    }

    found.push(provider);
  }

  return found;
});

/**
 * Orders plugins so each builds after its providers. Fails at the first service two plugins
 * provide, required service nobody provides, or cycle.
 */
export const buildOrder = Effect.fn("buildOrder")(function* (plugins: ReadonlyArray<AnyPlugin>) {
  const providers = yield* indexProviders(plugins);

  /** `ordered` followed by `plugin` and whichever of its providers it does not hold yet. */
  const visit: (
    plugin: AnyPlugin,
    path: ReadonlyArray<AnyPlugin>,
    ordered: ReadonlyArray<AnyPlugin>,
  ) => Effect.Effect<ReadonlyArray<AnyPlugin>, CompositionError> = Effect.fn("visit")(
    function* (plugin, path, ordered) {
      if (ordered.includes(plugin)) return ordered;

      if (path.includes(plugin)) {
        const loop = [...path.slice(path.indexOf(plugin)), plugin].map(({ name }) => name);

        return yield* new CompositionError({ reason: Cycle.make({ plugins: loop }) });
      }

      const withProviders = yield* Effect.reduce(
        yield* providersOf(plugin, providers),
        () => ordered,
        (done, provider) => visit(provider, [...path, plugin], done),
      );

      return [...withProviders, plugin];
    },
  );

  return yield* Effect.reduce(
    plugins,
    (): ReadonlyArray<AnyPlugin> => [],
    (done, plugin) => visit(plugin, [], done),
  );
});
