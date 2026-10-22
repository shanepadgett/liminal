/** The `codex` provider: OpenAI's models on a ChatGPT plan, through the Codex backend. */
import { Effect, Option } from "effect";
import { AiError } from "effect/ai";
import { HttpClient } from "effect/http";

import { Credentials, LoginMethods } from "@shanepadgett/liminal-accounts/contract";
import { responsesModel } from "@shanepadgett/liminal-model-wire/responses";
import { type LanguageModelOptions, ModelProviders } from "@shanepadgett/liminal-model/contract";

import { apiUrl, planModels, signedAs } from "./backend.ts";
import { codexLogin } from "./logins.ts";
import { refreshTokens } from "./tokens.ts";

const authFailed = (
  description: string,
  kind: AiError.AuthenticationError["kind"] = "MissingKey",
) =>
  AiError.make({
    module: "Codex",
    method: "sign",
    reason: new AiError.AuthenticationError({ kind, description }),
  });

const refreshFailed = (error: { readonly message: string }) =>
  authFailed(
    `Refreshing the Codex login failed: ${error.message}. Run liminal connect.`,
    "ExpiredKey",
  );

/** A saved login; a failing store counts as signed out. */
const signedIn = (credentials: Credentials["Service"]) =>
  credentials.get("codex").pipe(
    Effect.map(Option.isSome),
    Effect.catchTag("CredentialsFailed", (error) =>
      Effect.as(Effect.logWarning(error.message), false),
    ),
  );

/** The saved tokens, refreshed when due. */
const tokensOf = (credentials: Credentials["Service"], http: HttpClient.HttpClient) =>
  Effect.gen(function* () {
    const saved = yield* credentials.get("codex");
    if (Option.isNone(saved)) return yield* authFailed("Run liminal connect.");

    return yield* credentials
      .fresh("codex", refreshTokens(http))
      .pipe(Effect.catchTag("TokensRefused", refreshFailed));
  }).pipe(Effect.catchTag("CredentialsFailed", (error) => authFailed(error.message, "Unknown")));

export const registerCodex = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  yield* (yield* LoginMethods).add(codexLogin(http));

  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const credentials = yield* Credentials;
  const tokens = tokensOf(credentials, http);

  const models = Effect.map(
    Effect.flatMap(tokens, (signed) => planModels(http, signed)),
    (listed) => listed.map(({ id, name }) => ({ id: `codex/${id}`, name })),
  );

  const languageModel = Effect.fn("Codex.languageModel")(function* (
    model: string,
    { thinking, cacheKey }: LanguageModelOptions,
  ) {
    const transformClient = HttpClient.mapRequest(signedAs(yield* tokens, cacheKey));

    return yield* withHttp(
      responsesModel({ apiUrl, transformClient }, model, { thinking, cacheKey }),
    );
  });

  yield* (yield* ModelProviders).add({
    id: "codex",
    name: "Codex",
    // The plan offers OpenAI's models, which the catalog lists under `openai`.
    catalogId: "openai",
    defaults: { main: { model: "codex/gpt-6.1-sol" }, small: { model: "codex/gpt-6-luna" } },
    signedIn: signedIn(credentials),
    models,
    languageModel,
  });
});
