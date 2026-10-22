/**
 * The Claude subscription: sign in as Claude Code does, and send requests as Claude Code. Anthropic
 * refuses subscription tokens without Claude Code's headers and its identity as the first system
 * block.
 */
import { Clock, Effect, Redacted, Schema } from "effect";
import { HttpBody, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import {
  type Authorized,
  LoginFailed,
  LoginFlow,
  type LoginMethod,
  OAuth,
} from "@shanepadgett/liminal-accounts/contract";

/** The OAuth client of Claude Code, which subscription logins are issued to. */
const clientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const tokenUrl = "https://platform.claude.com/v1/oauth/token";
const methodId = "anthropic/subscription";

/** The Claude Code release requests name; bump it when Anthropic refuses an older one. */
const claudeCodeVersion = "2.1.307";
const claudeCodeBetas = ["claude-code-20250219", "oauth-2025-04-20"];
const identity = "You are Claude Code, Anthropic's official CLI for Claude.";

const scopes = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
].join(" ");

/** The token endpoint refused the request; `message` holds its reply. */
class TokensRefused extends Schema.TaggedError<TokensRefused, { readonly brand: unique symbol }>()(
  "TokensRefused",
  { message: Schema.String },
) {}

const TokenReply = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Finite,
});

/** Posts `fields` to the token endpoint and gives the tokens it issued. */
export const requestTokens = (
  client: HttpClient.HttpClient,
  fields: Readonly<Record<string, string>>,
) =>
  Effect.gen(function* () {
    const request = HttpClientRequest.post(tokenUrl).pipe(
      HttpClientRequest.bodyJsonUnsafe({ ...fields, client_id: clientId }),
    );

    const response = yield* client.execute(request);

    if (response.status >= 400) {
      return yield* new TokensRefused({ message: `${response.status} ${yield* response.text}` });
    }

    const reply = yield* HttpClientResponse.schemaBodyJson(TokenReply)(response);

    const now = yield* Clock.currentTimeMillis;

    return OAuth.make({
      access: Redacted.make(reply.access_token),
      refresh: Redacted.make(reply.refresh_token),
      expiresAt: now + reply.expires_in * 1000,
      extra: {},
    });
  });

const exchange = (client: HttpClient.HttpClient, authorized: Authorized) =>
  requestTokens(client, {
    grant_type: "authorization_code",
    code: authorized.code,
    state: authorized.state,
    redirect_uri: authorized.redirectUri,
    code_verifier: authorized.verifier,
  }).pipe(
    Effect.mapError(
      (error) =>
        new LoginFailed({ method: methodId, message: `Claude sign-in failed: ${error.message}` }),
    ),
  );

/** The Claude subscription login, through the browser that returns to Claude Code's port. */
export const subscriptionMethod = (client: HttpClient.HttpClient): LoginMethod => ({
  id: methodId,
  provider: "anthropic",
  title: "Claude subscription (Pro or Max)",
  run: Effect.gen(function* () {
    const flow = yield* LoginFlow;

    const authorized = yield* flow.authorizeInBrowser({
      authorizeUrl: "https://claude.ai/oauth/authorize",
      params: { client_id: clientId, scope: scopes, code: "true" },
      callback: { host: "localhost", port: 53692, path: "/callback" },
    });

    return yield* exchange(client, authorized);
  }),
});

export const refreshTokens = (client: HttpClient.HttpClient) => (stale: OAuth) =>
  requestTokens(client, {
    grant_type: "refresh_token",
    refresh_token: Redacted.value(stale.refresh),
  });

const MessagesBody = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json));

const isBlocks = Schema.is(Schema.Array(Schema.Json));

/** The Messages body with Claude Code's identity as the first system block. */
const withIdentity = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const { body } = request;

    if (!request.url.includes("/v1/messages") || !(body instanceof HttpBody.Uint8Array)) {
      return request;
    }

    const fields = yield* Schema.decodeEffect(MessagesBody)(new TextDecoder().decode(body.body));
    const system = fields["system"];
    const blocks = isBlocks(system) ? system : [];

    return HttpClientRequest.bodyJsonUnsafe(request, {
      ...fields,
      system: [{ type: "text", text: identity }, ...blocks],
    });
  }).pipe(Effect.orElseSucceed(() => request));

/** Appends Claude Code's betas after any the request asked for. */
const betasOf = (request: HttpClientRequest.HttpClientRequest) => {
  const requested = request.headers["anthropic-beta"];

  return (requested === undefined ? claudeCodeBetas : [requested, ...claudeCodeBetas]).join(",");
};

/** Signs every request with the subscription's access token, as Claude Code. */
export const asClaudeCode = (access: Redacted.Redacted) => (client: HttpClient.HttpClient) =>
  client.pipe(
    HttpClient.mapRequestEffect(withIdentity),
    HttpClient.mapRequest((request) =>
      request.pipe(
        HttpClientRequest.bearerToken(Redacted.value(access)),
        HttpClientRequest.setHeaders({
          "anthropic-beta": betasOf(request),
          "user-agent": `claude-cli/${claudeCodeVersion}`,
          "x-app": "cli",
        }),
      ),
    ),
  );
