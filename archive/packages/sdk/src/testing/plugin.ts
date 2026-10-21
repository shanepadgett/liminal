/** Builds one plugin's server for a test, with fakes for what it requires. */

import { Effect, Layer } from "effect";
import type { Rpc } from "effect/rpc";

import type { ServerPlugin, Services, ServiceTags } from "../core/index.ts";
import { testBaseServices } from "./base.ts";

/** The plugin's server Layer over `fakes` and the test base services; `fakes` must cover `requires`. */
export const testPlugin = <
  Provides extends ServiceTags,
  Requires extends ServiceTags,
  Uses extends ServiceTags,
  Error,
  FakeError,
  Rpcs extends Rpc.Any = never,
>(
  plugin: ServerPlugin<Provides, Requires, Uses, Error, Rpcs>,
  fakes: Layer.Layer<Services<Requires>, FakeError>,
) =>
  Layer.unwrap(
    Effect.map(Effect.promise(plugin.server), (server) =>
      server.layer.pipe(Layer.provide(fakes), Layer.provide(testBaseServices)),
    ),
  );

/** A plugin's server Layer over whatever the test provides, for stacking several plugins. */
export const serverOf = <
  Provides extends ServiceTags,
  Requires extends ServiceTags,
  Uses extends ServiceTags,
  Error,
  Rpcs extends Rpc.Any = never,
>(
  plugin: ServerPlugin<Provides, Requires, Uses, Error, Rpcs>,
) => Layer.unwrap(Effect.map(Effect.promise(plugin.server), (server) => server.layer));
