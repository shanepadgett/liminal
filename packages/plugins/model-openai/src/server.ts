/** Model-openai's server: provider `openai` over the platform's fetch. */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { openAiLayer } from "./server/provider.ts";

export const layer = openAiLayer.pipe(Layer.provide(FetchHttpClient.layer));
