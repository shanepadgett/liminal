/**
 * The Codex login: sign in with a ChatGPT plan in the browser, or with a device code entered on
 * another device, as the Codex CLI does.
 */

import { Duration, Effect, Option, Redacted, Schema } from "effect";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import type { OAuth } from "@liminal/credential-store/contract";
import { LoginFailed, LoginFlow, LoginMethod, LoginReturn } from "@liminal/logins/contract";

import { codexLogin } from "../contract.ts";
import { accountId, clientId, requestTokens } from "./auth.ts";

const issuer = "https://auth.openai.com";
const deviceUrl = `${issuer}/codex/device`;

/** The device code expires after this long, as the Codex CLI waits. */
const deviceLifetime = Duration.minutes(15);

const UserCode = Schema.Struct({
  device_auth_id: Schema.String,
  user_code: Schema.String,
  interval: Schema.Union([Schema.Finite, Schema.FiniteFromString]),
});

const DeviceAuthorization = Schema.Struct({
  authorization_code: Schema.String,
  code_verifier: Schema.String,
});

/** The poll answers these while the code is not entered yet. */
const pendingStatuses = new Set([403, 404]);

const failed = (message: string) => new LoginFailed({ method: codexLogin, message });

const postJson = (url: string, body: Readonly<Record<string, string>>) =>
  HttpClientRequest.post(url).pipe(HttpClientRequest.bodyJsonUnsafe(body));

/** Exchanges the code for tokens, checking they name a ChatGPT account. */
const exchange = (
  client: HttpClient.HttpClient,
  code: { readonly code: string; readonly verifier: string; readonly redirectUri: string },
) =>
  requestTokens(
    client,
    {
      grant_type: "authorization_code",
      code: code.code,
      code_verifier: code.verifier,
      redirect_uri: code.redirectUri,
    },
    {},
  ).pipe(
    Effect.tap((tokens) => accountId(Redacted.value(tokens.access))),
    Effect.mapError((cause) => failed(`Codex sign-in failed: ${cause.message}`)),
  );

const browserLogIn = (client: HttpClient.HttpClient) =>
  Effect.gen(function* () {
    const flow = yield* LoginFlow;

    const authorized = yield* flow.authorizeInBrowser({
      authorizeUrl: `${issuer}/oauth/authorize`,
      params: {
        client_id: clientId,
        scope: "openid profile email offline_access",
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "liminal",
      },
      // OpenAI accepts only this port for the Codex client.
      returnTo: LoginReturn.Callback({ host: "127.0.0.1", port: 1455, path: "/auth/callback" }),
    });

    return yield* exchange(client, authorized);
  });

/** Polls until the code is entered, waiting `interval` before each poll. */
const pollDevice = (client: HttpClient.HttpClient, started: typeof UserCode.Type) => {
  const request = postJson(`${issuer}/api/accounts/deviceauth/token`, {
    device_auth_id: started.device_auth_id,
    user_code: started.user_code,
  });

  const poll: Effect.Effect<typeof DeviceAuthorization.Type, LoginFailed> = Effect.gen(
    function* () {
      yield* Effect.sleep(Duration.seconds(started.interval));
      const response = yield* client.execute(request);
      if (pendingStatuses.has(response.status)) return yield* poll;

      return yield* HttpClientResponse.filterStatusOk(response).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(DeviceAuthorization)),
      );
    },
  ).pipe(Effect.mapError((cause) => failed(`Codex device sign-in failed: ${cause.message}`)));

  return poll;
};

const deviceLogIn = (client: HttpClient.HttpClient) =>
  Effect.gen(function* () {
    const flow = yield* LoginFlow;

    const response = yield* client
      .execute(postJson(`${issuer}/api/accounts/deviceauth/usercode`, { client_id: clientId }))
      .pipe(Effect.mapError((cause) => failed(`Codex device sign-in failed: ${cause.message}`)));

    if (response.status === 404)
      return yield* failed("Device code sign-in is off for this account; sign in in the browser");

    const started = yield* HttpClientResponse.filterStatusOk(response).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(UserCode)),
      Effect.mapError((cause) => failed(`Codex device sign-in failed: ${cause.message}`)),
    );

    yield* flow.showCode(started.user_code, deviceUrl);
    yield* flow.waiting("Waiting for the code to be entered");

    const authorization = yield* pollDevice(client, started).pipe(
      Effect.timeoutOrElse({
        duration: deviceLifetime,
        orElse: () => Effect.fail(failed("The device code expired before it was entered")),
      }),
    );

    return yield* exchange(client, {
      code: authorization.authorization_code,
      verifier: authorization.code_verifier,
      redirectUri: `${issuer}/deviceauth/callback`,
    });
  });

/** The Codex login method, signing in over `client`. */
export const codexMethod = (client: HttpClient.HttpClient) =>
  LoginMethod.Flow({
    id: codexLogin,
    vendor: { id: "openai", name: "OpenAI" },
    title: "ChatGPT plan (Codex)",
    ways: [
      { id: "browser", title: "Browser" },
      { id: "device", title: "Device code" },
    ],
    logIn: (way): Effect.Effect<OAuth, LoginFailed, LoginFlow> =>
      way === "device" ? deviceLogIn(client) : browserLogIn(client),
    logOut: Option.none(),
  });
