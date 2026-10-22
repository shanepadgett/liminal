/** Liminal's colors: the `theme` setting, served to frontends over `ThemeRpc`. */
import { Effect } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";

import { ThemeFailed, ThemeRpc, ThemeSetting } from "./contract.ts";

const failed = (error: { readonly message: string }) => new ThemeFailed({ message: error.message });

const rpc = ThemeRpc.toLayer(
  Effect.gen(function* () {
    const settings = yield* Settings;
    yield* (yield* DeclaredSettings).add(ThemeSetting);

    return ThemeRpc.of({
      "theme/get": () =>
        settings.get(ThemeSetting).pipe(
          Effect.map((theme) => theme.palette),
          Effect.mapError(failed),
        ),
      "theme/set": ({ palette }) =>
        Effect.mapError(settings.write("global", ["theme", "palette"], palette), failed),
    });
  }),
);

export default definePlugin({
  name: "theme",
  provides: [],
  requires: [Settings, DeclaredSettings],
  layer: rpc,
  entries: { tui: () => import("./tui/index.tsx") },
});
