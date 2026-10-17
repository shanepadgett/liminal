/** `definePlugin` and the manifest types the host reads. */

import type { Context, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

import type { Directories } from "./directories.ts";

/** Services the host gives every plugin without listing them in `requires`. */
export type BaseServices = FileSystem.FileSystem | Path.Path | ChildProcessSpawner | Directories;

/** A service tag a plugin provides, requires or uses. */
export type ServiceTag = Context.Key<unknown, unknown>;

export type ServiceTags = ReadonlyArray<ServiceTag>;

/** The service identifiers of a list of tags. */
export type Services<Tags extends ServiceTags> = IdentifierOf<Tags[number]>;

/** Distributes over a union of tags. */
type IdentifierOf<Tag> =
  Tag extends Context.Key<infer Identifier, infer _Shape> ? Identifier : never;

/** The module a plugin's `server` loads: its Layer. */
export interface ServerModule<Provided, Error, Needed> {
  readonly layer: Layer.Layer<Provided, Error, Needed>;
}

export interface Plugin<
  Provides extends ServiceTags = ServiceTags,
  Requires extends ServiceTags = ServiceTags,
  Uses extends ServiceTags = ServiceTags,
  Error = unknown,
> {
  /** Unique across every loaded plugin. */
  readonly name: string;
  readonly provides: Provides;
  /** The plugin is inactive unless every one of these is provided. */
  readonly requires: Requires;
  /** Optional services, read with `Effect.serviceOption`, so the layer never needs them. */
  readonly uses: Uses;
  readonly enabledByDefault: boolean;
  /** Loaded only after the graph resolves, so a disabled plugin's code never runs. */
  readonly server: () => Promise<
    ServerModule<Services<Provides>, Error, Services<Requires> | BaseServices>
  >;
}

/**
 * Declares a plugin. Fails to type-check unless the server's layer provides every `provides` tag
 * and needs nothing outside `requires` and the base services.
 */
export const definePlugin = <
  const Provides extends ServiceTags,
  const Requires extends ServiceTags,
  const Uses extends ServiceTags,
  Error,
>(
  plugin: Plugin<Provides, Requires, Uses, Error>,
): Plugin<Provides, Requires, Uses, Error> => plugin;
