/** One streamed reply from an `effect/ai` language model, as Liminal model events. */

import { Effect, type FileSystem, Stream } from "effect";
import type { LanguageModel } from "effect/ai";

import type { ModelError, ModelEvent, ModelRequest } from "../core/index.ts";
import type { ProviderData } from "./data.ts";
import { toModelError } from "./errors.ts";
import { streamOf } from "./events.ts";
import { promptOf, toolkitOf } from "./prompt.ts";

/**
 * Streams `request` from `model`. Liminal runs tool calls itself, so the model only reports them.
 * `name` names the provider in errors; `data` is the metadata reply parts keep for the next
 * request.
 */
export const replyOf = (
  name: string,
  data: ProviderData,
  model: Effect.Effect<LanguageModel.LanguageModel, ModelError>,
  request: ModelRequest,
): Stream.Stream<ModelEvent, ModelError, FileSystem.FileSystem> =>
  streamOf(
    name,
    data,
    Stream.unwrap(
      Effect.gen(function* () {
        const language = yield* model;
        const prompt = yield* promptOf(request.messages, data);
        const toolkit = yield* toolkitOf(request.tools);

        return language
          .streamText({
            prompt,
            toolkit,
            disableToolCallResolution: true,
            toolCallValidation: "deferred",
          })
          .pipe(Stream.mapError(toModelError));
      }),
    ),
  );
