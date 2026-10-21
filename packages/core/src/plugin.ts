/** A plugin: an Effect Layer with the service tags it provides and requires. */
import type { Context, Layer } from "effect";

/** Service tags. A Layer's services exist only in its types, so `compose` reads these at runtime. */
export type ServiceTags = ReadonlyArray<Context.Service.Any>;

/** The union of the tags' service identifiers. */
export type Ids<Tags extends ServiceTags> = Context.Service.Identifier<Tags[number]>;

/** A plugin's frontend modules by frontend name. Each frontend kit checks what its module exports. */
export type Entries = { readonly [frontend: string]: () => Promise<object> };

export interface Plugin<Provides extends ServiceTags, Requires extends ServiceTags, E> {
  /** Names the plugin in a `CompositionError`. */
  readonly name: string;
  readonly provides: Provides;
  readonly requires: Requires;
  readonly layer: Layer.Layer<Ids<Provides>, E, Ids<Requires>>;
  /** Loaded only by a frontend; a server never imports them. */
  readonly entries?: Entries;
}

/** Any plugin, as `compose` takes it: what its layer provides and needs is known only at runtime. */
export interface AnyPlugin extends Omit<Plugin<ServiceTags, ServiceTags, unknown>, "layer"> {
  readonly layer: Layer.Layer<never, unknown, unknown>;
}

/**
 * Declares a plugin. Fails to type-check when `layer` misses a `provides` tag or needs a service
 * outside `requires`: a Layer is contravariant in what it provides and covariant in what it needs.
 */
export const definePlugin = <
  const Provides extends ServiceTags,
  const Requires extends ServiceTags,
  E,
>(
  plugin: Plugin<Provides, Requires, E>,
): Plugin<Provides, Requires, E> => plugin;
