/** Model-codex's server: provider `codex` over the platform's fetch. */

import { Layer } from "effect";
import { FetchHttpClient } from "effect/http";

import { codexLayer } from "./server/provider.ts";

export const layer = codexLayer.pipe(Layer.provide(FetchHttpClient.layer));
