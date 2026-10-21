/** Theme's server: reads and writes the palette in the settings. */

import { Effect } from "effect";

import { Settings } from "@liminal/settings/contract";

import { ThemeError, ThemeRpcs, ThemeSettings } from "./contract.ts";

const make = Effect.gen(function* () {
  const store = yield* Settings;

  return ThemeRpcs.of({
    "theme/get": () =>
      store.section("theme", ThemeSettings).pipe(
        Effect.map(({ palette }) => palette),
        Effect.mapError((error) => new ThemeError({ message: error.message })),
      ),
    "theme/set": ({ palette }) =>
      store
        .write("global", ["theme", "palette"], palette)
        .pipe(Effect.mapError((error) => new ThemeError({ message: error.message }))),
  });
});

export const layer = ThemeRpcs.toLayer(make);
