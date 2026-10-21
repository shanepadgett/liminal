/** Model-openai's server: providers `openai` and `chatgpt` over the platform's fetch. */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { chatgptLayer } from "./server/chatgpt/provider.ts";
import { openAiLayer } from "./server/provider.ts";

export const layer = Layer.mergeAll(openAiLayer, chatgptLayer).pipe(
  Layer.provide(FetchHttpClient.layer),
);
