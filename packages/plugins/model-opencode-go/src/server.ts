/** Model-opencode-go's server: provider `opencode-go` over the platform's fetch. */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { openCodeGoLayer } from "./server/provider.ts";

export const layer = openCodeGoLayer.pipe(Layer.provide(FetchHttpClient.layer));
