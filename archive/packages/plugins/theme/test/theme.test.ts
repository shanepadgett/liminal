/** Theme: the saved palette is read from the settings and a pick is written to the global file. */

import { expect, test } from "bun:test";

import { Effect, Layer } from "effect";
import { RpcTest } from "effect/rpc";

import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import { DEFAULT_PALETTE_ID, PALETTES, paletteOf } from "@liminal/sdk/tui";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";

import theme from "../plugin.ts";
import { ThemeRpcs, ThemeSettings } from "../src/contract.ts";

const stack = serverOf(theme).pipe(
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

effectTest(
  "a pick is saved in the global settings and read back",
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(ThemeRpcs);

    expect(yield* client["theme/get"]()).toBeUndefined();

    yield* client["theme/set"]({ palette: "barbican" });
    expect(yield* client["theme/get"]()).toBe("barbican");

    const settings = yield* Settings;
    expect((yield* settings.section("theme", ThemeSettings)).palette).toBe("barbican");
  }),
  stack,
);

test("an unknown or missing palette id is the default palette", () => {
  expect(paletteOf().id).toBe(DEFAULT_PALETTE_ID);
  expect(paletteOf("nonesuch").id).toBe(DEFAULT_PALETTE_ID);
  expect(PALETTES.map((palette) => palette.id)).toContain(DEFAULT_PALETTE_ID);
  expect(paletteOf("conservatory").id).toBe("conservatory");
});
