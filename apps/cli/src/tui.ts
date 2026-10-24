/**
 * `liminal` with no flags: the TUI over the CLI's plugins, logging to `~/.liminal/logs`. Solid's
 * JSX transform is registered before the TUI loads, so its `.tsx` files run wherever `liminal`
 * starts; nothing loads them for print mode or the subcommands.
 */
import { Effect, Layer } from "effect";

import { host, plugins } from "./composition.ts";
import { tuiLogs } from "./logs.ts";

export const tui = Effect.gen(function* () {
  const solid = yield* Effect.promise(() => import("@opentui/solid/bun-plugin"));
  solid.ensureSolidTransformPlugin();
  const { run } = yield* Effect.promise(() => import("@shanepadgett/liminal-tui"));

  // The logger wraps the host, so every plugin's work logs to the TUI's file.
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the TUI's entry point.
  return yield* run(plugins).pipe(Effect.provide(Layer.provideMerge(host, tuiLogs)));
});
