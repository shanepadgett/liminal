/** Finds the plugins in folders: discover manifests, then resolve which can activate. */

import { Effect, Predicate } from "effect";

import { discover } from "./discover.ts";
import { type Resolution, resolve } from "./resolve.ts";
import { InactiveReason, PluginStatus } from "./status.ts";

export interface BootOptions {
  /** Folders whose packages hold plugins, such as the built-in plugins folder. */
  readonly folders: ReadonlyArray<string>;
}

export interface Loaded {
  readonly resolution: Resolution;
  /** Plugins that cannot activate: broken manifests and resolution failures. */
  readonly inactive: ReadonlyArray<PluginStatus>;
}

/** Discovers the manifests in `folders` and resolves which can activate; never fails. */
export const load = Effect.fn("load")(function* (folders: ReadonlyArray<string>) {
  const discovered = yield* discover(folders);

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

  const loaded: Loaded = { resolution, inactive: [...broken, ...unresolved] };

  return loaded;
});
