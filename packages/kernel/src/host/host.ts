/** Boots plugins from folders: discover manifests, resolve the graph, build each active plugin. */

import { Context, Effect, Predicate } from "effect";

import { build } from "./build.ts";
import { discover } from "./discover.ts";
import { resolve } from "./resolve.ts";
import { InactiveReason, PluginStatus } from "./status.ts";

export interface Booted {
  /** Every active plugin's services; check `status`, then read one with `Context.getOption`. */
  readonly services: Context.Context<never>;
  readonly status: ReadonlyArray<PluginStatus>;
}

export interface BootOptions {
  /** Folders whose packages hold plugins, such as the built-in plugins folder. */
  readonly folders: ReadonlyArray<string>;
}

/** Never fails: a plugin that cannot load or build is inactive with a reason, and boot continues. */
export const boot = Effect.fn("boot")(function* (options: BootOptions) {
  const discovered = yield* discover(options.folders);

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
  const built = yield* build(resolution);

  const inactive = [...resolution.inactive].map(([name, reason]) =>
    PluginStatus.Inactive({ name, reason }),
  );

  const booted: Booted = {
    services: built.services,
    status: [...broken, ...inactive, ...built.status],
  };

  return booted;
});
