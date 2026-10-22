/** The end of `ModelCall`: finds the provider, streams one attempt and retries what can be retried. */
import { Duration, Effect, Stream } from "effect";
import type { AiError } from "effect/ai";

import type { Registry } from "@shanepadgett/liminal-core";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import {
  type ModelDelta,
  type ModelId,
  ModelNotFound,
  type ModelProvider,
  type ModelRequest,
  type Retrying,
} from "./contract.ts";
import { promptOf, replay, toolkitOf } from "./prompt.ts";
import { defaultAttempts, ModelSetting } from "./setting.ts";

/** The provider `id` names and its own name for the model. */
export const findModel = Effect.fn("ModelCall.findModel")(function* (
  providers: Registry<ModelProvider>,
  id: ModelId,
) {
  const at = id.indexOf("/");
  const name = id.slice(0, at);
  const provider = (yield* providers.list).find((each) => each.id === name);

  if (at > 0 && provider !== undefined) return { provider, model: id.slice(at + 1) };

  return yield* new ModelNotFound({
    model: id,
    message: `No composed provider offers ${id}; a model is named provider/model.`,
  });
});

/** One try: the provider's language model streams the reply, or makes it whole for an output. */
const attempt = (provider: ModelProvider, model: string, request: ModelRequest) =>
  Stream.unwrap(
    Effect.map(provider.languageModel(model, request.thinking), (language) => {
      const options = {
        prompt: promptOf(request),
        toolkit: toolkitOf(request.tools),
        toolChoice: request.toolChoice ?? "auto",
        disableToolCallResolution: true,
        toolCallValidation: "deferred",
      } as const;

      const { output } = request;

      if (output === undefined) return language.streamText(options);

      return Stream.fromIterableEffect(
        Effect.map(
          language.generateObject({ ...options, objectName: output.name, schema: output.schema }),
          (response) => replay(response.content),
        ),
      );
    }),
  );

/** Waits `retryAfter` when the provider gives it, else 1s, 2s, 4s and on. */
const delayOf = (error: AiError.AiError, tried: number) =>
  error.retryAfter ?? Duration.seconds(2 ** (tried - 1));

const withRetries = (run: Stream.Stream<ModelDelta, AiError.AiError>, attempts: number) => {
  const from = (tried: number): Stream.Stream<ModelDelta, AiError.AiError> =>
    Stream.catch(run, (error) => {
      if (!error.isRetryable || tried >= attempts) return Stream.fail(error);

      const delay = delayOf(error, tried);

      const retrying: Retrying = {
        type: "retry",
        attempt: tried + 1,
        attempts,
        delay,
        message: error.message,
      };

      return Stream.make(retrying).pipe(
        Stream.concat(Stream.fromEffectDrain(Effect.sleep(delay))),
        Stream.concat(Stream.suspend(() => from(tried + 1))),
      );
    });

  return from(1);
};

export const makeCall =
  (providers: Registry<ModelProvider>, settings: Settings["Service"]) => (request: ModelRequest) =>
    Effect.succeed(
      Stream.unwrap(
        Effect.gen(function* () {
          const { provider, model } = yield* findModel(providers, request.model);
          const { attempts = defaultAttempts } = yield* settings.get(ModelSetting);

          return withRetries(attempt(provider, model, request), attempts);
        }),
      ),
    );
