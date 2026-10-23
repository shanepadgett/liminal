/**
 * The `/theme` picker: moving the selection shows that palette, enter saves it, and esc puts back
 * the one shown before.
 */
import { Effect } from "effect";
import type { Accessor } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { type EntryRun, openPicker } from "@shanepadgett/liminal-tui";

import { type Palette, ThemeRpc } from "../contract.ts";
import { PALETTES, paletteOf } from "../view/index.ts";

const save = (id: string) =>
  Effect.scoped(
    Effect.flatMap(Host, (host) =>
      Effect.flatMap(host.client(ThemeRpc), (theme) => theme["theme/set"]({ palette: id })),
    ),
  );

/** Opens the picker over `shown`, the palette on screen, which `show` changes; `run` saves. */
export const openPalettes = (
  shown: Accessor<Palette>,
  show: (palette: Palette) => void,
  run: EntryRun,
) =>
  Effect.gen(function* () {
    const before = shown();

    yield* openPicker({
      name: "theme/palettes",
      title: "Theme",
      placeholder: "Search themes",
      empty: "No themes",
      rows: () => PALETTES.map((palette) => ({ id: palette.id, title: palette.name })),
      initial: before.id,
      actions: [],
      onMove: (row) => {
        show(paletteOf(row.id));
      },
      onSelect: (row) => {
        show(paletteOf(row.id));
        run(save(row.id));
      },
      onClose: () => {
        show(before);
      },
    });
  });
