/** The end of `ModelCall`: finds the provider, streams one attempt and retries what can be retried. */
import { Duration, Effect, Stream } from "effect";
import type { AiError } from "effect/ai";

import type { Registry } from "@shanepadgett/liminal-core";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import {
  defaultThinking,
  type ModelCatalog,
  type ModelDelta,
  type ModelDetails,
  type ModelId,
  ModelNotFound,
  type ModelProvider,
  type ModelRequest,
  type Retrying,
} from "./contract.ts";
import { promptOf, replay, toolChangesOf, toolkitOf, toolsAfterChanges } from "./prompt.ts";
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

/**
 * The details of `provider`'s models by its own ids; none when it names no catalog id or the
 * catalog is unavailable, and calls still run.
 */
export const detailsOf = (catalog: ModelCatalog["Service"], provider: ModelProvider) => {
  const none = new Map<string, ModelDetails>();
  if (provider.catalogId === undefined) return Effect.succeed(none);

  return catalog.models(provider.catalogId).pipe(
    Effect.map((models) => new Map(models.map((model) => [model.id, model.details]))),
    Effect.catchTag("CatalogUnavailable", (error) =>
      Effect.as(Effect.logWarning(error.message), none),
    ),
  );
};

/** The request's tool changes when the provider takes them natively for `model`. */
const nativeChangesOf = (provider: ModelProvider, model: string, request: ModelRequest) => {
  const changes = toolChangesOf(request);
  const isNative = changes.length > 0 && provider.nativeToolChanges?.(model) === true;

  return isNative ? { declared: request.tools, changes } : undefined;
};

/** One try: the provider's language model streams the reply, or makes it whole for an output. */
const attempt = (
  provider: ModelProvider,
  model: string,
  request: ModelRequest,
  details: ModelDetails | undefined,
) => {
  const toolChanges = nativeChangesOf(provider, model, request);
  const { cacheKey } = request;
  const thinking = request.thinking ?? defaultThinking(details?.thinking ?? []);

  return Stream.unwrap(
    Effect.map(
      provider.languageModel(model, { thinking, cacheKey, details, toolChanges }),
      (language) => {
        const options = {
          prompt: promptOf(request, {
            images: details?.images !== false,
            isNative: toolChanges !== undefined,
          }),
          toolkit: toolkitOf(toolsAfterChanges(request)),
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
      },
    ),
  );
};

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
  (
    providers: Registry<ModelProvider>,
    settings: Settings["Service"],
    catalog: ModelCatalog["Service"],
  ) =>
  (request: ModelRequest) =>
    Effect.succeed(
      Stream.unwrap(
        Effect.gen(function* () {
          const { provider, model } = yield* findModel(providers, request.model);
          const { attempts = defaultAttempts } = yield* settings.get(ModelSetting);
          const details = (yield* detailsOf(catalog, provider)).get(model);

          return withRetries(attempt(provider, model, request, details), attempts);
        }),
      ),
    );
