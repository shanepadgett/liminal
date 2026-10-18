/**
 * The Claude subscription login: sign in in the browser, which returns to a local server, or copy
 * the code Anthropic's page shows, as Claude Code does.
 */

import { Effect, Option } from "effect";
import type { HttpClient } from "effect/http";

import type { OAuth } from "@liminal/credential-store/contract";
import {
  type Authorized,
  LoginFailed,
  LoginFlow,
  LoginMethod,
  LoginReturn,
} from "@liminal/logins/contract";

import { claudeProvider } from "../contract.ts";
import { clientId, requestTokens } from "./auth.ts";

const scopes = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
].join(" ");

/** Where each way returns: Claude Code's local callback, or the page that shows `code#state`. */
const returns = {
  browser: LoginReturn.Callback({ host: "localhost", port: 53692, path: "/callback" }),
  code: LoginReturn.Page({ redirectUri: "https://platform.claude.com/oauth/code/callback" }),
};

/** Exchanges the code for tokens. */
const exchange = (client: HttpClient.HttpClient, authorized: Authorized) =>
  requestTokens(client, {
    grant_type: "authorization_code",
    code: authorized.code,
    state: authorized.state,
    redirect_uri: authorized.redirectUri,
    code_verifier: authorized.verifier,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new LoginFailed({
          method: claudeProvider,
          message: `Claude sign-in failed: ${cause.message}`,
        }),
    ),
  );

const logIn = (client: HttpClient.HttpClient, returnTo: LoginReturn) =>
  Effect.gen(function* () {
    const flow = yield* LoginFlow;

    const authorized = yield* flow.authorizeInBrowser({
      authorizeUrl: "https://claude.ai/oauth/authorize",
      params: { client_id: clientId, scope: scopes, code: "true" },
      returnTo,
    });

    return yield* exchange(client, authorized);
  });

/** The Claude subscription login method, signing in over `client`. */
export const claudeMethod = (client: HttpClient.HttpClient) =>
  LoginMethod.Flow({
    id: claudeProvider,
    vendor: { id: "anthropic", name: "Anthropic" },
    title: "Claude subscription",
    ways: [
      { id: "browser", title: "Browser" },
      { id: "code", title: "Copy a code" },
    ],
    logIn: (way): Effect.Effect<OAuth, LoginFailed, LoginFlow> =>
      logIn(client, way === "code" ? returns.code : returns.browser),
    logOut: Option.none(),
  });
