/** `definePlugin` and the manifest types the host reads. */

import type { Context, Crypto, FileSystem, Layer, Path } from "effect";
import type { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import type { Rpc, RpcGroup } from "effect/rpc";

import type { Directories } from "./directories.ts";
import type { FrontendPart } from "./frontend.ts";
import type { EventBus } from "./protocol.ts";
import type { TurnGate } from "./turn-gate.ts";
import type { Work } from "./work.ts";

/** Services the host gives every plugin without listing them in `requires`. */
export type BaseServices =
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner
  | Crypto.Crypto
  | Directories
  | EventBus
  | TurnGate
  | Work;

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

/** A plugin's `server`: loads its Layer, checked against the manifest. */
export type ServerLoader<
  Provides extends ServiceTags,
  Requires extends ServiceTags,
  Error,
  Rpcs extends Rpc.Any,
> = () => Promise<
  ServerModule<Services<Provides> | Rpc.ToHandler<Rpcs>, Error, Services<Requires> | BaseServices>
>;

export interface Plugin<
  Provides extends ServiceTags = ServiceTags,
  Requires extends ServiceTags = ServiceTags,
  Uses extends ServiceTags = ServiceTags,
  Error = unknown,
  Rpcs extends Rpc.Any = never,
> {
  /** Unique across every loaded plugin. */
  readonly name: string;
  readonly provides: Provides;
  /** The plugin is inactive unless every one of these is provided. */
  readonly requires: Requires;
  /** Optional services, read with `Effect.serviceOption`, so the layer never needs them. */
  readonly uses: Uses;
  readonly enabledByDefault: boolean;
  /** The commands the kernel serves from this plugin; the server's layer handles each one. */
  readonly rpcs?: RpcGroup.RpcGroup<Rpcs>;
  /**
   * Loaded only after the graph resolves, so a disabled plugin's code never runs. A plugin with no
   * services and no commands, such as a UI-only one, has none.
   */
  readonly server?: ServerLoader<Provides, Requires, Error, Rpcs>;
  /**
   * The plugin's TUI part, a module whose default export is `defineTui(...)`; imported when the
   * kernel builds the plugin for a TUI. Load the plugin's own files here or in `server`, never with
   * a later `import()`: only what loads at build is checked before new code applies.
   */
  readonly tui?: () => Promise<PartModule>;
}

/** A frontend part's module: its default export is the part, such as `defineTui(...)`. */
export interface PartModule {
  readonly default: FrontendPart<unknown>;
}

/** An active plugin of the kernel's current graph, as an in-process frontend sees it. */
export interface GraphMember {
  readonly name: string;
  /** Changes each time the plugin is rebuilt. */
  readonly build: number;
  /**
   * The manifest's frontend parts, imported when the kernel built the plugin; each module is
   * checked by the frontend that runs it.
   */
  readonly parts: { readonly tui?: PartModule };
}

/** A plugin with a server part, as its tests build it. */
export type ServerPlugin<
  Provides extends ServiceTags = ServiceTags,
  Requires extends ServiceTags = ServiceTags,
  Uses extends ServiceTags = ServiceTags,
  Error = unknown,
  Rpcs extends Rpc.Any = never,
> = Plugin<Provides, Requires, Uses, Error, Rpcs> & {
  readonly server: ServerLoader<Provides, Requires, Error, Rpcs>;
};

/** `server` is required once the plugin provides a service or serves a command. */
type NeedsServer<
  Provides extends ServiceTags,
  Requires extends ServiceTags,
  Error,
  Rpcs extends Rpc.Any,
> = [Services<Provides> | Rpc.ToHandler<Rpcs>] extends [never]
  ? unknown
  : { readonly server: ServerLoader<Provides, Requires, Error, Rpcs> };

/**
 * Declares a plugin. Fails to type-check unless the server's layer provides every `provides` tag
 * and needs nothing outside `requires` and the base services. The result keeps the parts it was
 * given, so a plugin that has a `server` is a ServerPlugin.
 */
export const definePlugin = <
  const Provides extends ServiceTags,
  const Requires extends ServiceTags,
  const Uses extends ServiceTags,
  Error,
  Rpcs extends Rpc.Any = never,
  Given extends object = object,
>(
  plugin: Plugin<Provides, Requires, Uses, Error, Rpcs>
    & NeedsServer<Provides, Requires, Error, Rpcs>
    & Given,
): Plugin<Provides, Requires, Uses, Error, Rpcs>
  & NeedsServer<Provides, Requires, Error, Rpcs>
  & Given => plugin;
