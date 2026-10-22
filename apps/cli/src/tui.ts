/**
 * `liminal` with no flags: the TUI over the CLI's plugins. Solid's JSX transform is registered
 * before the TUI loads, so its `.tsx` files run wherever `liminal` starts; nothing loads them for
 * print mode or the subcommands.
 */
import { Effect } from "effect";

import { host, plugins } from "./composition.ts";

export const tui = Effect.gen(function* () {
  const solid = yield* Effect.promise(() => import("@opentui/solid/bun-plugin"));
  solid.ensureSolidTransformPlugin();
  const { run } = yield* Effect.promise(() => import("@shanepadgett/liminal-tui"));

  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the TUI's entry point.
  return yield* run(plugins).pipe(Effect.provide(host));
});
