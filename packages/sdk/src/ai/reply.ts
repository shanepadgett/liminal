/** One streamed reply from an `effect/ai` language model, as Liminal model events. */

import { Effect, type FileSystem, Stream } from "effect";
import type { LanguageModel } from "effect/ai";

import type { ModelError, ModelEvent, ModelRequest } from "../core/index.ts";
import { toModelError } from "./errors.ts";
import { streamOf } from "./events.ts";
import { promptOf, toolkitOf } from "./prompt.ts";
import type { ProviderPrompt } from "./provider-prompt.ts";

/**
 * Streams `request` from `model`. Liminal runs tool calls itself, so the model only reports them.
 * `name` names the provider in errors; `provider` shapes the prompt for it.
 */
export const replyOf = (
  name: string,
  provider: ProviderPrompt,
  model: Effect.Effect<LanguageModel.LanguageModel, ModelError>,
  request: ModelRequest,
): Stream.Stream<ModelEvent, ModelError, FileSystem.FileSystem> =>
  streamOf(
    name,
    provider.data,
    Stream.unwrap(
      Effect.gen(function* () {
        const language = yield* model;
        const prompt = yield* promptOf(request.messages, provider);
        const toolkit = yield* toolkitOf(request.tools);

        return language
          .streamText({
            prompt,
            toolkit,
            toolChoice: request.toolChoice ?? "auto",
            disableToolCallResolution: true,
            toolCallValidation: "deferred",
          })
          .pipe(Stream.mapError(toModelError));
      }),
    ),
  );
