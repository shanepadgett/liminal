/** What a graph change keeps from the current graph, and when it must refuse the new one. */

import { Predicate, Schema } from "effect";

import type { PluginBuild } from "../host/build.ts";
import type { PluginPackage } from "../host/packages.ts";
import type { Resolution } from "../host/resolve.ts";
import { describeReason, type PluginStatus } from "../host/status.ts";

/** One plugin that built in the current graph and fails in the new one. */
export const FailedPlugin = Schema.Struct({ name: Schema.String, reason: Schema.String });

/** A graph change that would break plugins; the current graph stays. */
export class ChangeFailed extends Schema.TaggedError<
  ChangeFailed,
  { readonly brand: unique symbol }
>()("ChangeFailed", { failed: Schema.Array(FailedPlugin) }) {}

/** The parts of the current graph a change compares against. */
export interface Previous {
  readonly builds: ReadonlyArray<PluginBuild>;
  readonly providers: ReadonlyMap<string, string>;
  readonly packages: ReadonlyArray<PluginPackage>;
}

/** The names of the plugins a package load found. */
export const pluginsOf = (loaded: PluginPackage) =>
  loaded.discovered.flatMap((found) =>
    Predicate.isTagged(found, "Found") ? [found.manifest.name] : [],
  );

/** Plugins in `names` and every active plugin that needs or uses one, directly or not. */
const withDependents = (previous: Previous, names: ReadonlySet<string>) => {
  const reached = new Set(names);

  // Builds come in dependency order, so one pass reaches every dependent.
  for (const build of previous.builds) {
    const { manifest } = build;

    const needsReached = [...manifest.requires, ...manifest.uses].some(({ key }) =>
      reached.has(previous.providers.get(key) ?? ""),
    );

    if (needsReached) reached.add(manifest.name);
  }

  return reached;
};

/**
 * The package folders a change loads fresh: the changed ones, and those of every plugin that
 * depends on a plugin in them, so a dependent reads a changed contract from the same files.
 */
export const packagesToLoad = (
  previous: Previous,
  changed: ReadonlySet<string>,
): ReadonlySet<string> => {
  const changedPlugins = previous.packages.flatMap((loaded) =>
    changed.has(loaded.dir) ? pluginsOf(loaded) : [],
  );

  const reached = withDependents(previous, new Set(changedPlugins));
  const dirs = new Set(changed);

  for (const loaded of previous.packages)
    if (pluginsOf(loaded).some((name) => reached.has(name))) dirs.add(loaded.dir);

  return dirs;
};

/** Whether every service `build` needs comes from the same, kept, provider as before. */
const sameInputs = (
  build: PluginBuild,
  previous: Previous,
  resolution: Resolution,
  kept: ReadonlyMap<string, PluginBuild>,
) =>
  [...build.manifest.requires, ...build.manifest.uses].every(({ key }) => {
    const provider = resolution.providers.get(key);
    if (provider !== previous.providers.get(key)) return false;

    return provider === undefined || kept.has(provider);
  });

/**
 * The current graph's builds the new one reuses: each plugin not named, still active, whose
 * providers are unchanged and themselves reused. Everything else builds again.
 */
export const keptBuilds = (
  previous: Previous,
  resolution: Resolution,
  names: ReadonlySet<string>,
): ReadonlyMap<string, PluginBuild> => {
  const active = new Set(resolution.active.map((plugin) => plugin.name));
  const kept = new Map<string, PluginBuild>();

  // Builds come in dependency order, so each provider is decided before its dependents.
  for (const build of previous.builds) {
    const { name } = build.manifest;
    if (names.has(name) || !active.has(name)) continue;
    if (sameInputs(build, previous, resolution, kept)) kept.set(name, build);
  }

  return kept;
};

const failure = (status: PluginStatus) =>
  Predicate.isTagged(status, "Inactive")
  && (Predicate.isTagged(status.reason, "ImportFailed")
    || Predicate.isTagged(status.reason, "BuildFailed"))
    ? status.reason
    : undefined;

/** Plugins active before that now fail to load or build. */
export const newlyFailing = (
  before: ReadonlyArray<PluginStatus>,
  after: ReadonlyArray<PluginStatus>,
): ReadonlyArray<typeof FailedPlugin.Type> => {
  const wasActive = new Set(
    before.flatMap((status) => (Predicate.isTagged(status, "Active") ? [status.name] : [])),
  );

  return after.flatMap((status) => {
    const reason = failure(status);

    return reason !== undefined && wasActive.has(status.name)
      ? [{ name: status.name, reason: describeReason(reason) }]
      : [];
  });
};
