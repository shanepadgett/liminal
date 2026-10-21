/** Decides which plugins can activate: one provider per service, no cycles, every requirement met. */

import { Graph } from "effect";

import type { Manifest } from "./manifest.ts";
import { InactiveReason } from "./status.ts";

export interface Resolution {
  /** In discovery order; each one's required providers are active too. */
  readonly active: ReadonlyArray<Manifest>;
  readonly inactive: ReadonlyMap<string, InactiveReason>;
  /** The provider picked for each service key. */
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

/** Why `name` does not provide `service`, given who does. */
const loserReason = (service: string, active: string, isChosen: boolean) =>
  isChosen
    ? InactiveReason.Replaced({ service, by: active })
    : InactiveReason.Competing({ service, active });

/**
 * One provider per service: the one chosen in `plugins.json`, else the first found. Two chosen
 * leave the service with none. Every other provider is marked inactive.
 */
const pickProviders = (
  byKey: ReadonlyMap<string, ReadonlyArray<string>>,
  choices: ReadonlyMap<string, boolean>,
  inactive: Map<string, InactiveReason>,
) => {
  const providers = new Map<string, string>();

  for (const [service, plugins] of byKey) {
    const chosen = plugins.filter((name) => choices.get(name) === true);

    if (chosen.length > 1) {
      for (const name of plugins)
        inactive.set(name, InactiveReason.DuplicateProvider({ service, plugins: chosen }));

      continue;
    }

    const [active] = chosen.length === 1 ? chosen : plugins;
    if (active === undefined) continue;
    providers.set(service, active);

    for (const name of plugins) {
      if (name !== active) inactive.set(name, loserReason(service, active, chosen.length === 1));
    }
  }

  return providers;
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

/**
 * Which of `plugins`, in discovery order, can activate; `choices` turns plugins on or off by name
 * over their manifests' `enabledByDefault`.
 */
export const resolve = (
  plugins: ReadonlyArray<Manifest>,
  choices: ReadonlyMap<string, boolean>,
): Resolution => {
  const inactive = new Map<string, InactiveReason>();

  for (const plugin of plugins) {
    const choice = choices.get(plugin.name);

    if (choice === false) inactive.set(plugin.name, InactiveReason.Disabled({ by: "choice" }));
    else if (choice === undefined && !plugin.enabledByDefault)
      inactive.set(plugin.name, InactiveReason.Disabled({ by: "default" }));
  }

  const enabled = plugins.filter((plugin) => !inactive.has(plugin.name));
  const providers = pickProviders(providersByKey(enabled), choices, inactive);

  markCycles(enabled, providers, inactive);
  markUnmet(plugins, providers, inactive);

  return { active: plugins.filter((plugin) => !inactive.has(plugin.name)), inactive, providers };
};
