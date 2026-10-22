/** OpenAI's models, for each way of signing in to them. */
import { Layer } from "effect";
import { HttpClient } from "effect/http";

import { Credentials, LoginMethods } from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import { ModelProviders } from "@shanepadgett/liminal-model/contract";

import { registerCodex } from "./codex/provider.ts";

export default definePlugin({
  name: "model-openai",
  provides: [],
  requires: [ModelProviders, Credentials, LoginMethods, HttpClient.HttpClient],
  layer: Layer.effectDiscard(registerCodex),
});
