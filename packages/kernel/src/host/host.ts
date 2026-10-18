/** Finds the plugins in folders: load each package's manifests, then resolve which can activate. */

import { Effect, Predicate } from "effect";

import { discover } from "./discover.ts";
import type { PluginPackage } from "./packages.ts";
import { type Resolution, resolve } from "./resolve.ts";
import { InactiveReason, PluginStatus } from "./status.ts";

export interface Loaded {
  readonly resolution: Resolution;
  /** Plugins that cannot activate: broken manifests and resolution failures. */
  readonly inactive: ReadonlyArray<PluginStatus>;
  /** Every package found, reused or loaded fresh. */
  readonly packages: ReadonlyArray<PluginPackage>;
}

/**
 * Loads the packages in `folders`, reusing the loads `reuse` returns, and resolves which plugins
 * can activate; never fails.
 */
export const load = Effect.fn("load")(function* (
  folders: ReadonlyArray<string>,
  reuse: (dir: string) => PluginPackage | undefined,
) {
  const packages = yield* discover(folders, reuse);
  const discovered = packages.flatMap((found) => found.discovered);

  const manifests = discovered.flatMap((found) =>
    Predicate.isTagged(found, "Found") ? [found.manifest] : [],
  );

  const broken = discovered.flatMap((found) =>
    Predicate.isTagged(found, "Broken")
      ? [
          PluginStatus.Inactive({
            name: found.name,
            reason: InactiveReason.ImportFailed({ cause: found.cause }),
          }),
        ]
      : [],
  );

  const resolution = resolve(manifests);

  const unresolved = [...resolution.inactive].map(([name, reason]) =>
    PluginStatus.Inactive({ name, reason }),
  );

  const loaded: Loaded = { resolution, inactive: [...broken, ...unresolved], packages };

  return loaded;
});
