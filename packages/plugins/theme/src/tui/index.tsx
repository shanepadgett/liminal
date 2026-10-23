/**
 * The theme's `tui` entry: the saved palette's colors, as `Colors`, and `/theme`, which previews
 * each palette as the selection moves and saves the one picked.
 */
import type { SyntaxStyle } from "@opentui/core";
import { Effect, Layer } from "effect";
import { createSignal } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  Colors,
  Dialogs,
  Keymap,
  makeEntryRun,
  Pickers,
  registerCommands,
  Renderer,
  type RoleColor,
} from "@shanepadgett/liminal-tui";

import { ThemeRpc } from "../contract.ts";
import { DEFAULT_PALETTE_ID, mixHex, paletteOf, roleColors } from "../view/index.ts";
import { openPalettes } from "./picker.ts";
import { syntaxStyle } from "./syntax.ts";

/** The saved palette's id; a failure leaves the default palette on screen. */
const savedPalette = Effect.gen(function* () {
  const client = yield* (yield* Host).client(ThemeRpc);

  return yield* client["theme/get"]();
}).pipe(
  Effect.catch((error) =>
    Effect.as(Effect.logWarning("Using the default palette.", error.message), DEFAULT_PALETTE_ID),
  ),
  Effect.scoped,
);

const make = Effect.gen(function* () {
  const renderer = yield* Renderer;
  const run = yield* makeEntryRun("The theme failed.");
  const [palette, setPalette] = createSignal(paletteOf(yield* savedPalette));
  // One of each per palette, kept until the TUI closes, so switching back does not rebuild them.
  const colors = new Map<string, RoleColor>();
  const styles = new Map<string, SyntaxStyle>();

  const color = () => {
    const { id } = palette();
    const known = colors.get(id) ?? roleColors(palette());
    colors.set(id, known);

    return known;
  };

  const syntax = () => {
    const { id } = palette();
    const known = styles.get(id) ?? syntaxStyle(color(), renderer.nativeScene);
    styles.set(id, known);

    return known;
  };

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      for (const style of styles.values()) style.destroy();
    }),
  );

  yield* registerCommands([
    {
      name: "theme.pick",
      title: "Switch theme",
      category: "Liminal",
      slash: { name: "theme" },
      run: () => {
        run(openPalettes(palette, setPalette, run));
      },
    },
  ]);

  return Colors.of({ color, syntax, mix: mixHex });
});

export default definePlugin({
  name: "theme-tui",
  provides: [Colors],
  requires: [Host, Renderer, Keymap, Dialogs, Pickers],
  layer: Layer.effect(Colors, make),
});
