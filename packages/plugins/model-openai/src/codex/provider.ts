/** The `codex` provider: OpenAI's models on a ChatGPT plan, through the Codex backend. */
import { Effect } from "effect";
import { HttpClient } from "effect/http";

import {
  credentialSaved,
  Credentials,
  LoginMethods,
} from "@shanepadgett/liminal-accounts/contract";
import { responsesModel } from "@shanepadgett/liminal-model-wire/responses";
import { type LanguageModelOptions, ModelProviders } from "@shanepadgett/liminal-model/contract";

import { freshTokens } from "../sign.ts";
import { codexToolChanges } from "../tool-changes.ts";
import { apiUrl, codexModels, signedAs } from "./backend.ts";
import { codexLogin } from "./logins.ts";
import { refreshTokens } from "./tokens.ts";

export const registerCodex = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  yield* (yield* LoginMethods).add(codexLogin(http));

  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const credentials = yield* Credentials;

  const tokens = freshTokens(
    credentials,
    { provider: "codex", module: "Codex", title: "Codex" },
    refreshTokens(http),
  );

  const languageModel = Effect.fn("Codex.languageModel")(function* (
    model: string,
    { thinking, cacheKey, toolChanges }: LanguageModelOptions,
  ) {
    const transformClient = HttpClient.mapRequest(signedAs(yield* tokens, cacheKey));

    return yield* withHttp(
      responsesModel(
        { apiUrl, transformClient },
        model,
        // The Codex backend answers only streamed requests, even for structured output.
        { thinking, cacheKey, toolChanges, streamOnly: true },
      ),
    );
  });

  yield* (yield* ModelProviders).add({
    id: "codex",
    name: "Codex",
    // The plan offers OpenAI's models, which the catalog lists under `openai`.
    catalogId: "openai",
    defaults: {
      main: { model: "codex/gpt-6.1-sol" },
      small: { model: "codex/gpt-6-luna", thinking: "high" },
    },
    signedIn: credentialSaved(credentials, "codex"),
    models: Effect.flatMap(tokens, (signed) => codexModels(http, signed)),
    nativeToolChanges: codexToolChanges,
    languageModel,
  });
});
