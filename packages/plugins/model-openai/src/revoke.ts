/** Logging out of an OpenAI login revokes its refresh token, as the Codex CLI does. */
import { Effect, Option, Redacted, Schema } from "effect";
import { type HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http";

import { type Credential, LogoutFailed, OAuth } from "@shanepadgett/liminal-accounts/contract";

/** The refresh token as revoke form fields for the client `clientId`. */
export const revokeFields = (tokens: OAuth, clientId: string) => ({
  token: Redacted.value(tokens.refresh),
  token_type_hint: "refresh_token",
  client_id: clientId,
});

/**
 * A `logOut` that sends the request `requestOf` makes for the saved tokens; anything else saved, or
 * no request, has nothing to revoke.
 */
export const revoking =
  (
    provider: string,
    client: HttpClient.HttpClient,
    requestOf: (tokens: OAuth) => Option.Option<HttpClientRequest.HttpClientRequest>,
  ) =>
  (saved: Credential): Effect.Effect<void, LogoutFailed> => {
    const request = Option.flatMap(Option.liftPredicate(saved, Schema.is(OAuth)), requestOf);
    if (Option.isNone(request)) return Effect.void;

    return client.execute(request.value).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.asVoid,
      Effect.mapError(
        (cause) =>
          new LogoutFailed({
            provider,
            message: `The login is removed here, but OpenAI did not confirm the sign-out (${cause.message}). To end it at OpenAI, disconnect Liminal in ChatGPT settings at chatgpt.com/settings.`,
          }),
      ),
    );
  };
