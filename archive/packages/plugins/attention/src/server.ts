/** Attention's server: reads and writes the sound's choices in the settings. */

import { Effect } from "effect";

import { Settings } from "@liminal/settings/contract";

import { AttentionError, AttentionRpcs, AttentionSettings } from "./contract.ts";

const toError = (error: { readonly message: string }) =>
  new AttentionError({ message: error.message });

const make = Effect.gen(function* () {
  const store = yield* Settings;

  return AttentionRpcs.of({
    "attention/get": () =>
      store.section("attention", AttentionSettings).pipe(Effect.mapError(toError)),
    "attention/set-enabled": ({ enabled }) =>
      store.write("global", ["attention", "enabled"], enabled).pipe(Effect.mapError(toError)),
    "attention/set-sound": ({ sound }) =>
      store.write("global", ["attention", "sound"], sound).pipe(Effect.mapError(toError)),
  });
});

export const layer = AttentionRpcs.toLayer(make);
