/** Credential-store: one credential per login method, and OAuth refresh under a lock. */

import { Clock, Context, type Duration, Effect, type Option, Redacted, Schema } from "effect";
import { type HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http";

export const ApiKey = Schema.TaggedStruct("ApiKey", { key: Schema.Redacted(Schema.String) });

export const OAuth = Schema.TaggedStruct("OAuth", {
  access: Schema.Redacted(Schema.String),
  refresh: Schema.Redacted(Schema.String),
  /** Milliseconds since the Unix epoch. */
  expiresAt: Schema.Int,
  /** What the login method keeps beside its tokens, such as an account id. */
  extra: Schema.Record(Schema.String, Schema.Json),
});

export type OAuth = typeof OAuth.Type;

/** What an OAuth token endpoint answers with. */
const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Finite,
});

/** Sends `request` to a token endpoint and gives the tokens it issued, keeping `extra` beside them. */
export const issuedTokens = Effect.fn("issuedTokens")(function* (
  client: HttpClient.HttpClient,
  request: HttpClientRequest.HttpClientRequest,
  extra: OAuth["extra"],
) {
  const tokens = yield* client
    .execute(request)
    .pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
    );

  const now = yield* Clock.currentTimeMillis;

  return OAuth.make({
    access: Redacted.make(tokens.access_token),
    refresh: Redacted.make(tokens.refresh_token),
    expiresAt: now + Math.round(tokens.expires_in * 1000),
    extra,
  });
});

/** A command whose output, trimmed, is the secret; it runs on every read. */
export const CommandCredential = Schema.TaggedStruct("Command", { command: Schema.String });

export const Credential = Schema.Union([ApiKey, OAuth, CommandCredential]);

export type Credential = typeof Credential.Type;

/** The store failed, a command credential failed, or a method has no OAuth credential to refresh. */
export class CredentialError extends Schema.TaggedError<
  CredentialError,
  { readonly brand: unique symbol }
>()("CredentialError", { method: Schema.String, message: Schema.String }) {}

export class CredentialStore extends Context.Service<
  CredentialStore,
  {
    readonly get: (method: string) => Effect.Effect<Option.Option<Credential>, CredentialError>;
    readonly set: (method: string, credential: Credential) => Effect.Effect<void, CredentialError>;
    readonly remove: (method: string) => Effect.Effect<void, CredentialError>;
    /**
     * The secret to send: an API key, an OAuth access token or a command's output from the store,
     * else environment variable `env`.
     */
    readonly secret: (
      method: string,
      options: { readonly env?: string },
    ) => Effect.Effect<Option.Option<Redacted.Redacted>, CredentialError>;
    /**
     * The method's OAuth credential, refreshed first by `refresh` when it expires within `skew`.
     * Holds the store's write lock from the read through the save, so one process refreshes.
     */
    readonly fresh: <E>(
      method: string,
      refresh: (stale: OAuth) => Effect.Effect<OAuth, E>,
      skew: Duration.Duration,
    ) => Effect.Effect<OAuth, CredentialError | E>;
  }
>()("liminal/credential-store/CredentialStore") {}
