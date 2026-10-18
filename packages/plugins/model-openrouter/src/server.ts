/** Model-openrouter's server: provider `openrouter` over the platform's fetch. */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { openRouterLayer } from "./server/provider.ts";

export const layer = openRouterLayer.pipe(Layer.provide(FetchHttpClient.layer));
