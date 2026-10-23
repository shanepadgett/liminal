/**
 * Model favorites' `tui` entry: it wraps the models picker. Favorites move to a Favorites section
 * above the providers, their provider's name leading the detail; `ctrl+f` adds the selected model
 * or takes it out, and the picker stays open.
 */
import { Effect, Layer } from "effect";
import { createSignal } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import { MODELS_PICKER } from "@shanepadgett/liminal-model-choice/contract";
import type { ModelId } from "@shanepadgett/liminal-model/contract";
import {
  Dialogs,
  type kit,
  makeEntryRun,
  type PickerSpec,
  Pickers,
} from "@shanepadgett/liminal-tui";

import { FavoritesRpc } from "../contract.ts";

const FAVORITES = "Favorites";

const client = Effect.flatMap(Host, (host) => host.client(FavoritesRpc));

const list = Effect.scoped(
  Effect.flatMap(client, (favorites) => favorites["model-favorites/list"]()),
);

const toggle = (model: ModelId) =>
  Effect.scoped(
    Effect.flatMap(client, (favorites) => favorites["model-favorites/toggle"]({ model })),
  );

/** A favorite's row: in the Favorites section, its provider before its detail. */
const favoriteRow = (row: kit.PickerRow): kit.PickerRow => {
  const detail = [row.section, row.detail].filter((part) => part !== undefined).join(" · ");

  return { id: row.id, title: row.title, section: FAVORITES, detail };
};

/** `rows` with the favorites moved to the top, in the order they were added. */
const arrange = (rows: ReadonlyArray<kit.PickerRow>, favorites: ReadonlyArray<ModelId>) => {
  const byId = new Map(rows.map((row) => [row.id, row]));

  const top = favorites.flatMap((id) => {
    const row = byId.get(id);

    return row === undefined ? [] : [favoriteRow(row)];
  });

  return [...top, ...rows.filter((row) => !favorites.includes(row.id))];
};

const make = Effect.gen(function* () {
  const pickers = yield* Pickers;
  const runEffect = yield* makeEntryRun("Model favorites failed.");
  const [favorites, setFavorites] = createSignal<ReadonlyArray<ModelId>>([]);

  /** Runs `effect` and keeps the list it returns. */
  const run = <E,>(effect: Effect.Effect<ReadonlyArray<ModelId>, E, Host>) => {
    runEffect(Effect.map(effect, (next) => setFavorites(next)));
  };

  const withFavorites = (spec: PickerSpec): PickerSpec => ({
    ...spec,
    rows: () => arrange(spec.rows(), favorites()),
    actions: [
      ...spec.actions,
      {
        key: "ctrl+f",
        label: "favorite",
        keepsOpen: true,
        run: (row) => {
          run(toggle(row.id));
        },
      },
    ],
  });

  run(list);

  yield* pickers.wrap((spec, next) => {
    if (spec.name !== MODELS_PICKER) return next(spec);
    run(list);

    return Effect.map(next(spec), withFavorites);
  });
});

export default definePlugin({
  name: "model-favorites-tui",
  provides: [],
  requires: [Host, Dialogs, Pickers],
  layer: Layer.effectDiscard(make),
});
