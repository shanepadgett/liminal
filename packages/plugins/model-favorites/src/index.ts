/**
 * Model favorites: the `model-favorites` setting and its RPCs. A toggle reads the saved list first,
 * so a change made in the settings file stays. The `tui` entry adds them to the models picker.
 */
import { Effect, Semaphore } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import type { ModelId } from "@shanepadgett/liminal-model/contract";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";

import { FavoritesRpc, FavoritesSetting } from "./contract.ts";

/** `favorites` without `model` when it is in the list, else with it added last. */
const toggled = (favorites: ReadonlyArray<ModelId>, model: ModelId) =>
  favorites.includes(model)
    ? favorites.filter((favorite) => favorite !== model)
    : [...favorites, model];

const rpc = FavoritesRpc.toLayer(
  Effect.gen(function* () {
    const settings = yield* Settings;
    yield* (yield* DeclaredSettings).add(FavoritesSetting);
    // Two toggles at once would both read the list before either writes it.
    const lock = yield* Semaphore.make(1);

    const list = Effect.map(settings.get(FavoritesSetting), (setting) => setting.models ?? []);

    const toggle = Effect.fn("ModelFavorites.toggle")(function* (model: ModelId) {
      const next = toggled(yield* list, model);
      yield* settings.write("global", [FavoritesSetting.key, "models"], next);

      return next;
    }, lock.withPermits(1));

    return FavoritesRpc.of({
      "model-favorites/list": () => list,
      "model-favorites/toggle": ({ model }) => toggle(model),
    });
  }),
);

export default definePlugin({
  name: "model-favorites",
  provides: [],
  requires: [Settings, DeclaredSettings],
  layer: rpc,
  entries: { tui: () => import("./tui/index.tsx") },
});
