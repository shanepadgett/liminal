/** The end of `SessionModel`: the first signed-in provider's `main` default, whatever the session. */
import { Effect, Option } from "effect";

import type { Registry } from "@shanepadgett/liminal-core";
import { type ModelProvider, ModelNotFound } from "@shanepadgett/liminal-model/contract";

import type { SessionModel } from "./contract.ts";

export const providerDefault =
  (providers: Registry<ModelProvider>): SessionModel["Service"]["run"] =>
  () =>
    Effect.gen(function* () {
      const signedIn = yield* Effect.findFirst(yield* providers.list, (each) => each.signedIn);
      if (Option.isSome(signedIn)) return signedIn.value.defaults.main;

      return yield* new ModelNotFound({
        model: "main",
        message: "No model provider is connected. Run liminal connect.",
      });
    });
