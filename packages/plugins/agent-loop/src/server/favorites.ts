/**
 * The favorite models, kept as the `favorites` list of the `agent-loop` settings section. A toggle
 * reads the saved list first, so a change made in the settings file stays.
 */

import { Effect, Semaphore } from "effect";

import type { ModelRef } from "@liminal/sdk";
import type { Settings } from "@liminal/settings/contract";

import { AgentLoopSection, FavoritesFailed } from "../contract.ts";

const isSameModel = (left: ModelRef, right: ModelRef) =>
  left.provider === right.provider && left.id === right.id;

/** `favorites` without `model` when it is in the list, else with it added last. */
export const toggled = (favorites: ReadonlyArray<ModelRef>, model: ModelRef) =>
  favorites.some((favorite) => isSameModel(favorite, model))
    ? favorites.filter((favorite) => !isSameModel(favorite, model))
    : [...favorites, model];

export const makeFavorites = Effect.fn("makeFavorites")(function* (settings: Settings["Service"]) {
  // Two toggles at once would both read the list before either writes it.
  const lock = yield* Semaphore.make(1);

  const read = settings.section("agent-loop", AgentLoopSection).pipe(
    Effect.map((section) => section.favorites ?? []),
    Effect.mapError((error) => new FavoritesFailed({ message: error.message })),
  );

  const toggleFavorite = Effect.fn("AgentLoop.toggleFavorite")(function* (model: ModelRef) {
    const next = toggled(yield* read, model);

    yield* settings
      .write("global", ["agent-loop", "favorites"], next)
      .pipe(Effect.mapError((error) => new FavoritesFailed({ message: error.message })));

    return next;
  }, lock.withPermits(1));

  return {
    favorites: read.pipe(Effect.orElseSucceed((): ReadonlyArray<ModelRef> => [])),
    toggleFavorite,
  };
});
