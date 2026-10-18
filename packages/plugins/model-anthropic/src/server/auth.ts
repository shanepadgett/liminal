/**
 * The Claude subscription's OAuth tokens, and the Claude Code headers subscription requests carry.
 * Anthropic refuses subscription tokens without both the headers and Claude Code's identity.
 */

import { Duration, Effect, Option, Predicate, Redacted } from "effect";
import { type HttpClient, HttpClientRequest } from "effect/http";

import { type CredentialStore, issuedTokens, type OAuth } from "@liminal/credential-store/contract";
import { type ModelContent, ModelError } from "@liminal/sdk";

import { claudeProvider } from "../contract.ts";

/** The OAuth client of Claude Code, which the subscription login is issued to. */
export const clientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const tokenUrl = "https://platform.claude.com/v1/oauth/token";

/** Tokens are refreshed when they expire within this long. */
const refreshSkew = Duration.minutes(1);

const claudeCodeBetas = ["claude-code-20250219", "oauth-2025-04-20"];

/** The system text Anthropic expects first on a subscription request. */
export const claudeCodeIdentity: ModelContent = {
  role: "system",
  parts: [
    {
      type: "text",
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
      providerData: {},
    },
  ],
};

const authError = (message: string) => new ModelError({ reason: "auth", message });

/** Posts `fields` as JSON to the token endpoint and gives the tokens it issued. */
export const requestTokens = (
  client: HttpClient.HttpClient,
  fields: Readonly<Record<string, string>>,
) =>
  issuedTokens(
    client,
    HttpClientRequest.post(tokenUrl).pipe(
      HttpClientRequest.bodyJsonUnsafe({ ...fields, client_id: clientId }),
    ),
    {},
  );

const refreshTokens = (client: HttpClient.HttpClient) => (stale: OAuth) =>
  requestTokens(client, {
    grant_type: "refresh_token",
    refresh_token: Redacted.value(stale.refresh),
  }).pipe(Effect.mapError((cause) => authError(`Claude token refresh failed: ${cause.message}`)));

/** Fails as `auth` while no Claude login is saved, without refreshing. */
export const checkClaudeLogin = (store: CredentialStore["Service"]) =>
  store.get(claudeProvider).pipe(
    Effect.mapError((error) => authError(`Claude login could not be read: ${error.message}`)),
    Effect.flatMap((saved) =>
      Option.isSome(saved) && Predicate.isTagged(saved.value, "OAuth")
        ? Effect.void
        : Effect.fail(authError("No Claude login: sign in with /connect")),
    ),
  );

/** The fresh access token, refreshed when it nears expiry. */
export const freshAccess = (store: CredentialStore["Service"], client: HttpClient.HttpClient) =>
  store.fresh(claudeProvider, refreshTokens(client), refreshSkew).pipe(
    Effect.map((tokens) => Redacted.value(tokens.access)),
    Effect.catchTag("CredentialError", (error) =>
      Effect.fail(authError(`No usable Claude login: ${error.message}`)),
    ),
  );

/** Appends Claude Code's betas after any the package asked for. */
const betasOf = (request: HttpClientRequest.HttpClientRequest) => {
  const requested = request.headers["anthropic-beta"];

  return (requested === undefined ? claudeCodeBetas : [requested, ...claudeCodeBetas]).join(",");
};

/** Signs a request as Claude Code `version` with the subscription's access token. */
export const signAsClaudeCode =
  (access: string, version: string) => (request: HttpClientRequest.HttpClientRequest) =>
    request.pipe(
      HttpClientRequest.bearerToken(access),
      HttpClientRequest.setHeaders({
        "anthropic-beta": betasOf(request),
        "user-agent": `claude-cli/${version}`,
        "x-app": "cli",
      }),
    );
