/** Decides which plugins can activate: one provider per service, no cycles, every requirement met. */

import { Graph } from "effect";

import type { Manifest } from "./manifest.ts";
import { InactiveReason } from "./status.ts";

export interface Resolution {
  /** In discovery order; each one's required providers are active too. */
  readonly active: ReadonlyArray<Manifest>;
  readonly inactive: ReadonlyMap<string, InactiveReason>;
  /** The single enabled provider of each service key. */
  readonly providers: ReadonlyMap<string, string>;
}

const providersByKey = (plugins: ReadonlyArray<Manifest>): Map<string, Array<string>> => {
  const byKey = new Map<string, Array<string>>();

  for (const plugin of plugins) {
    for (const tag of plugin.provides)
      byKey.set(tag.key, [...(byKey.get(tag.key) ?? []), plugin.name]);
  }

  return byKey;
};

const markDuplicates = (
  byKey: ReadonlyMap<string, ReadonlyArray<string>>,
  inactive: Map<string, InactiveReason>,
) => {
  for (const [service, plugins] of byKey) {
    if (plugins.length < 2) continue;

    for (const plugin of plugins) {
      inactive.set(plugin, InactiveReason.DuplicateProvider({ service, plugins }));
    }
  }
};

/** Every strongly connected group with more than one plugin, or a plugin that needs itself. */
const markCycles = (
  plugins: ReadonlyArray<Manifest>,
  providers: ReadonlyMap<string, string>,
  inactive: Map<string, InactiveReason>,
) => {
  const names = plugins.map((plugin) => plugin.name);

  const graph = Graph.directed<string, null>((mutable) => {
    const nodes = new Map(names.map((name) => [name, Graph.addNode(mutable, name)]));

    for (const plugin of plugins) {
      for (const tag of [...plugin.requires, ...plugin.uses]) {
        const target = nodes.get(providers.get(tag.key) ?? "");
        const source = nodes.get(plugin.name);

        if (source !== undefined && target !== undefined)
          Graph.addEdge(mutable, source, target, null);
      }
    }
  });

  for (const component of Graph.stronglyConnectedComponents(graph)) {
    const [only] = component;

    const isSelfLoop =
      component.length === 1 && only !== undefined && Graph.hasEdge(graph, only, only);

    if (component.length < 2 && !isSelfLoop) continue;

    const members = component.flatMap((index) => names[index] ?? []);
    for (const member of members) inactive.set(member, InactiveReason.Cycle({ plugins: members }));
  }
};

/** The first unmet requirement of `plugin`, given the plugins already inactive. */
const unmetRequirement = (
  plugin: Manifest,
  providers: ReadonlyMap<string, string>,
  inactive: ReadonlyMap<string, InactiveReason>,
): InactiveReason | undefined => {
  for (const tag of plugin.requires) {
    const provider = providers.get(tag.key);
    if (provider === undefined) return InactiveReason.MissingService({ service: tag.key });
    if (inactive.has(provider)) return InactiveReason.DependencyInactive({ plugin: provider });
  }

  return undefined;
};

/** Repeats until stable, since each newly inactive plugin can strand its dependents. */
const markUnmet = (
  plugins: ReadonlyArray<Manifest>,
  providers: ReadonlyMap<string, string>,
  inactive: Map<string, InactiveReason>,
) => {
  let isChanged = true;

  while (isChanged) {
    isChanged = false;

    for (const plugin of plugins) {
      if (inactive.has(plugin.name)) continue;

      const reason = unmetRequirement(plugin, providers, inactive);
      if (reason === undefined) continue;
      inactive.set(plugin.name, reason);
      isChanged = true;
    }
  }
};

export const resolve = (plugins: ReadonlyArray<Manifest>): Resolution => {
  const inactive = new Map<string, InactiveReason>();

  for (const plugin of plugins) {
    if (!plugin.enabledByDefault) inactive.set(plugin.name, InactiveReason.Disabled());
  }

  const enabled = plugins.filter((plugin) => !inactive.has(plugin.name));
  const byKey = providersByKey(enabled);
  markDuplicates(byKey, inactive);

  const providers = new Map<string, string>();

  for (const [key, names] of byKey) {
    const [only] = names;
    if (names.length === 1 && only !== undefined) providers.set(key, only);
  }

  markCycles(enabled, providers, inactive);
  markUnmet(plugins, providers, inactive);

  return { active: plugins.filter((plugin) => !inactive.has(plugin.name)), inactive, providers };
};
