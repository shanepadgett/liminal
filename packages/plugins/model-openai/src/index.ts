/** OpenAI's models, for each way of signing in to them. */
import { Effect, Layer } from "effect";
import { HttpClient } from "effect/http";

import { Credentials, LoginMethods } from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import { ModelCatalog, ModelProviders } from "@shanepadgett/liminal-model/contract";

import { registerCodex } from "./codex/provider.ts";
import { registerOpenAi } from "./openai/provider.ts";

export default definePlugin({
  name: "model-openai",
  provides: [],
  requires: [ModelProviders, ModelCatalog, Credentials, LoginMethods, HttpClient.HttpClient],
  layer: Layer.effectDiscard(Effect.all([registerOpenAi, registerCodex])),
});
