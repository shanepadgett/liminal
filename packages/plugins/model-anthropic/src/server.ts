/** Model-anthropic's server: providers `anthropic` and `anthropic-api` over the platform's fetch. */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { anthropicLayer } from "./server/provider.ts";

export const layer = anthropicLayer.pipe(Layer.provide(FetchHttpClient.layer));
