/** Favorite models, kept in the global settings file and served over `FavoritesRpc`. */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { ModelId } from "@shanepadgett/liminal-model/contract";
import {
  Setting,
  SettingsInvalid,
  SettingsWriteFailed,
} from "@shanepadgett/liminal-settings/contract";

/** The `model-favorites` key in `settings.json`. */
export const FavoritesSetting = Setting.make(
  "model-favorites",
  Schema.Struct({ models: Schema.optionalKey(Schema.Array(ModelId)) }),
);

export class FavoritesRpc extends RpcGroup.make(
  /** The favorite models, in the order they were added. */
  Rpc.make("model-favorites/list", { success: Schema.Array(ModelId), error: SettingsInvalid }),
  /** Adds `model` last, or takes it out; returns the list as saved. */
  Rpc.make("model-favorites/toggle", {
    payload: { model: ModelId },
    success: Schema.Array(ModelId),
    error: Schema.Union([SettingsInvalid, SettingsWriteFailed]),
  }),
) {}
