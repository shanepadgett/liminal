/**
 * The Codex login, as the Codex CLI signs in: through the browser, or with a code entered on
 * another device.
 */
import { Duration, Effect, Schema } from "effect";
import {
  type HttpClient,
  type HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";

import {
  LoginFailed,
  LoginFlow,
  type LoginMethod,
  type LoginWay,
} from "@shanepadgett/liminal-accounts/contract";

import { clientId, issuer, tokensFor } from "./tokens.ts";

const methodId = "codex/plan";

/** How long a device code lasts, as the Codex CLI waits. */
const deviceLifetime = Duration.minutes(15);

const UserCode = Schema.Struct({
  device_auth_id: Schema.String,
  user_code: Schema.String,
  interval: Schema.Union([Schema.Finite, Schema.FiniteFromString]),
});

type UserCode = typeof UserCode.Type;

const DeviceAuthorization = Schema.Struct({
  authorization_code: Schema.String,
  code_verifier: Schema.String,
});

type DeviceAuthorization = typeof DeviceAuthorization.Type;

/** The poll answers these while the code is not entered yet. */
const pendingStatuses = new Set([403, 404]);

const failure = (cause: { readonly message: string }) =>
  new LoginFailed({ method: methodId, message: `Codex sign-in failed: ${cause.message}` });

const exchange = (
  client: HttpClient.HttpClient,
  code: { readonly code: string; readonly verifier: string; readonly redirectUri: string },
) =>
  tokensFor(client, {
    grant_type: "authorization_code",
    code: code.code,
    code_verifier: code.verifier,
    redirect_uri: code.redirectUri,
  }).pipe(Effect.mapError(failure));

const postJson = (url: string, body: Readonly<Record<string, string>>) =>
  HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJsonUnsafe(body));

/** Signs in through the browser, which returns to the port the Codex client is registered on. */
const browserWay = (client: HttpClient.HttpClient): LoginWay => ({
  id: "browser",
  title: "In the browser",
  run: Effect.gen(function* () {
    const authorized = yield* (yield* LoginFlow).authorizeInBrowser({
      authorizeUrl: `${issuer}/oauth/authorize`,
      params: {
        client_id: clientId,
        scope: "openid profile email offline_access",
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "liminal",
      },
      callback: { host: "localhost", port: 1455, path: "/auth/callback" },
    });

    return yield* exchange(client, authorized);
  }),
});

/** Asks for a code to show; a 404 means the account has device sign-in turned off. */
const startDevice = Effect.fn("Codex.startDevice")(function* (client: HttpClient.HttpClient) {
  const response = yield* client.execute(
    postJson(`${issuer}/api/accounts/deviceauth/usercode`, { client_id: clientId }),
  );

  if (response.status === 404) {
    return yield* new LoginFailed({
      method: methodId,
      message: "Device code sign-in is off for this account. Sign in in the browser instead.",
    });
  }

  return yield* HttpClientResponse.filterStatusOk(response).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(UserCode)),
  );
});

/** Waits `interval`, then asks whether the code was entered, until it is. */
const pollDevice = (
  client: HttpClient.HttpClient,
  started: UserCode,
): Effect.Effect<DeviceAuthorization, HttpClientError.HttpClientError | Schema.SchemaError> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.seconds(started.interval));

    const response = yield* client.execute(
      postJson(`${issuer}/api/accounts/deviceauth/token`, {
        device_auth_id: started.device_auth_id,
        user_code: started.user_code,
      }),
    );

    if (pendingStatuses.has(response.status)) return yield* pollDevice(client, started);

    return yield* HttpClientResponse.filterStatusOk(response).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceAuthorization)),
    );
  });

/** Shows a code to enter at OpenAI's device page, then waits for it. */
const deviceWay = (client: HttpClient.HttpClient): LoginWay => ({
  id: "device",
  title: "With a code entered on another device",
  run: Effect.gen(function* () {
    const flow = yield* LoginFlow;
    const started = yield* startDevice(client);

    yield* flow.showCode(started.user_code, `${issuer}/codex/device`);
    yield* flow.waiting("Waiting for the code to be entered");

    const authorization = yield* pollDevice(client, started).pipe(
      Effect.timeoutOrElse({
        duration: deviceLifetime,
        orElse: () =>
          new LoginFailed({ method: methodId, message: "The device code expired. Try again." }),
      }),
    );

    return yield* exchange(client, {
      code: authorization.authorization_code,
      verifier: authorization.code_verifier,
      redirectUri: `${issuer}/deviceauth/callback`,
    });
  }).pipe(Effect.catchTags({ HttpClientError: failure, SchemaError: failure })),
});

/** The Codex login for a ChatGPT plan (Plus, Pro, Business), saved under `codex`. */
export const codexLogin = (client: HttpClient.HttpClient): LoginMethod => ({
  id: methodId,
  provider: "codex",
  vendor: "OpenAI",
  title: "Codex (ChatGPT plan)",
  ways: [browserWay(client), deviceWay(client)],
});
