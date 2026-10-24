/** Fetching model lists, and the list a ChatGPT plan gets from the Codex backend. */
import { Effect, Schema } from "effect";
import { AiError } from "effect/ai";
import { type HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http";

/** Sends `request` and decodes the reply; failures are `AiError`s from `module`. */
export const fetchList = Effect.fn("fetchList")(function* <A>(
  module: string,
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  schema: Schema.Decoder<A>,
) {
  const failed = (reason: AiError.AiErrorReason) =>
    AiError.make({ module, method: "models", reason });

  const unknown = (error: { readonly message: string }) =>
    failed(new AiError.UnknownError({ description: error.message }));

  const response = yield* client.execute(request).pipe(Effect.mapError(unknown));

  if (response.status >= 400) {
    return yield* failed(
      AiError.reasonFromHttpStatus({
        status: response.status,
        description: yield* response.text.pipe(Effect.orElseSucceed(() => "")),
      }),
    );
  }

  return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(Effect.mapError(unknown));
});

const PlanModels = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      display_name: Schema.optionalKey(Schema.String),
      /** The window the plan serves by default, smaller than the model's full window. */
      context_window: Schema.optionalKey(Schema.Int),
      /** `hide` marks models kept for the Codex CLI's own use, such as reviews. */
      visibility: Schema.String,
    }),
  ),
});

export type PlanModel = (typeof PlanModels.Type)["models"][number];

/** The models a ChatGPT plan offers; hidden ones are left out. */
export const planModels = Effect.fn("planModels")(function* (
  module: string,
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
) {
  const { models } = yield* fetchList(module, client, request, PlanModels);

  return models.filter((model) => model.visibility === "list");
});

/** A plan model as a model id under `provider`, its name and the window the plan serves. */
export const planModelInfo = (provider: string, model: PlanModel) => ({
  id: `${provider}/${model.slug}`,
  name: model.display_name ?? model.slug,
  contextWindow: model.context_window,
});
