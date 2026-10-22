/** OpenAI's models, for each way of signing in to them. */
import { Crypto, Effect, FileSystem, Layer, Path } from "effect";
import { HttpClient } from "effect/http";

import { Credentials, LoginMethods } from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { ModelCatalog, ModelProviders } from "@shanepadgett/liminal-model/contract";

import { registerChatgpt } from "./chatgpt/provider.ts";
import { registerCodex } from "./codex/provider.ts";
import { registerOpenAi } from "./openai/provider.ts";

export default definePlugin({
  name: "model-openai",
  provides: [],
  requires: [
    ModelProviders,
    ModelCatalog,
    Credentials,
    LoginMethods,
    Directories,
    HttpClient.HttpClient,
    FileSystem.FileSystem,
    Path.Path,
    Crypto.Crypto,
  ],
  layer: Layer.effectDiscard(Effect.all([registerOpenAi, registerChatgpt, registerCodex])),
});
